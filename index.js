var exec = require('child_process').exec

var zlib = require('zlib');
var fs = require('fs');
var path = require('path');
var request = require('request');
var stringFormat = require('sprintf-js').sprintf;
var requestPromise = require('request-promise');

var WINDOWS = 0;
var MAC_OSX = 1;
var PBE = 2;

var isWindows = () => {
  return process.platform == 'win32'
}

var getOperatingSystemUrl = (operatingSystem) => {
  switch(operatingSystem) {
    case WINDOWS:
      return 'http://l3cdn.riotgames.com/releases/live';
    case MAC_OSX:
      return 'http://l3cdn.riotgames.com/releases/Maclive';
    case PBE:
      return 'http://l3cdn.riotgames.com/releases/pbe';
    default:
      return '';
  }
}

var getReleasesUrl = () => {
  return '/projects/lol_game_client/releases'
}

var getListingUrl = (operatingSystem) => {
  switch(operatingSystem) {
    case PBE:
      return getOperatingSystemUrl(operatingSystem) + getReleasesUrl() + '/releaselisting_PBE'
    default:
      return getOperatingSystemUrl(operatingSystem) + getReleasesUrl() + '/releaselisting_OC1'
  }
}

var getPackageManifest = (operatingSystem, version) => {
  return getOperatingSystemUrl(operatingSystem) + getReleasesUrl() + '/' + version + '/packages/files/packagemanifest'
}

var getGameClientFile = (operatingSystem, version) => {
  switch(operatingSystem) {
    case MAC_OSX:
      return getOperatingSystemUrl(operatingSystem) + getReleasesUrl() + '/' + version + '/files/LeagueofLegends.app/Contents/MacOS/LeagueofLegends.compressed';
    default:
      return getOperatingSystemUrl(operatingSystem) + getReleasesUrl() + '/' + version + '/files/League of Legends.exe.compressed';
  }
}

var isExe = (operatingSystem) => {
  return operatingSystem == WINDOWS || operatingSystem == PBE;
}

var getFileVersion = (filePath, next) => {
  if (isWindows()) {
    var cmd = 'wmic datafile where name="' + path.resolve(filePath).replace(/\\/g, "\\\\") + '" get Version';
    exec(cmd, (err, stdout, stderr) => {
      if(!err){
        var split = stdout.split('\n');
        for (var i = 0; i < split.length; i++) {
          split[i] = split[i].trim()
        }
        var fileVersion = split[1];
        console.log(fileVersion);
        next(fileVersion)
      } else {
        console.log(err)
      }
    });
  }
}

var downloadUncompressedFile = (operatingSystem, version) => {
  var uncompressedFileName = version;
  if (isExe(operatingSystem)) {
    uncompressedFileName += '.exe'
  }
  var compressedFileName = uncompressedFileName + '.compressed'

  var compressedFilePath = compressedFileName;
  var uncompressedFilePath = uncompressedFileName;
  if (!fs.existsSync(uncompressedFilePath)) {
    request({
      uri: getGameClientFile(operatingSystem, String(version)),
      method: 'GET' })
    .on('response', (response) => {
      //save file on server
      if (response.statusCode !== 200) {
        return null;
      }

      var compressedStream = response
      .pipe(fs.createWriteStream(compressedFileName))
      compressedStream.on('finish', () => {
        // save uncompressed file on server
        var zlibStream = fs.createReadStream(compressedFileName)
        .pipe(zlib.createInflate())
        .pipe(fs.createWriteStream(uncompressedFilePath));
        zlibStream.on('finish', () => {
          //remove compressed file
          fs.unlink(compressedFileName, () => {
            getFileVersion(uncompressedFilePath, (fileVersion) => {
              var fileVersionName = fileVersion;
              if (isExe(operatingSystem)) {
                fileVersionName += '.exe'
              }
              fs.createReadStream(uncompressedFilePath).pipe(fs.createWriteStream(fileVersionName));
            })
          });
        });
        zlibStream.on('error', (error) => {
          //remove compressed file
          fs.unlink(compressedFileName, () => {

          });
          //console.log(error);
          return null;
        });
      });
      compressedStream.on('error', (error) => {
        //remove compressed file
        fs.unlink(compressedFileName, () => {
          //console.log(error);
          return null;
        });
      });
    })
    .on('error', (error) => {
        //console.log(error);
        return null;
    })
  }
}

var getVersionsList = (operatingSystem, next) => {
  requestPromise({
      method: 'GET',
      uri: getListingUrl(operatingSystem)
    })
  .then((response) => {
    var data = [];
    var split = response.split("\n");
    for (var i = 0; i < split.length; i++) {
      var version = String(split[i].trim());
      if (version) {
        data.push(version);
      }
    }
    return next(data);
  })
  .catch((error) => {
    //console.log(error)
    return null;
  });
}

var getPackageList = (operatingSystem, version, next) => {
  request({
    method: 'GET',
    uri: getPackageManifest(operatingSystem, String(version)),
  })
  .on('response', (response) => {
    if (response.statusCode !== 200) {
      return null;
    }
    var packagePath = version + '.packagemanifest';
    var stream = response
    .pipe(fs.createWriteStream(packagePath));

    stream.on('finish', () => {

    })
  }).on('error', (error) => {
    //console.log(error)
    return null;
  });
}

var operatingSystem = MAC_OSX;
getVersionsList(operatingSystem, (versionList) => {
  /*
  var arr = [];
  for (var i = 1; i >= 0; i--) {
    for (var j = 1; j >= 0; j--) {
      for (var k = 1; k >= 0; k--) {
        for (var l = 255; l >= 0; l--) {
          arr.push(i + "." + j + "." + k + "." + l);
        }
      }
    }
  }
  versionList = arr;
  */
  var length = versionList.length
  for (var i = 0; i < length; i++) {
    var version = versionList[i];
    downloadUncompressedFile(operatingSystem, version);
  }
});
