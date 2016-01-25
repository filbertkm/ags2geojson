#!/usr/bin/env node

var program = require('commander'),
    q = require('q'),
    request = q.nfbind(require('request')),
    fs = require('fs'),
    tmp = require('tmp'),
    ogr2ogr = require('ogr2ogr');

program
.arguments('<datadir>')
.action(function(datadir) {
  extract(datadir);
})
.parse(process.argv);

if (!program.args.length) {
  program.help();
}

function extract(dataDir) {
  console.log('processing...');

  var layers = {
    noncounty: 'http://www7.montgomerycountymd.gov/arcgis/rest/services/snow_public/snow_routes_public/MapServer/2/query',
    emergency: 'http://www7.montgomerycountymd.gov/arcgis/rest/services/snow_public/snow_routes_public/MapServer/3/query',
	primary: 'http://www7.montgomerycountymd.gov/arcgis/rest/services/snow_public/snow_routes_public/MapServer/4/query',
	neighborhood: 'http://www7.montgomerycountymd.gov/arcgis/rest/services/snow_public/snow_routes_public/MapServer/5/query'
  };

  for (var k in layers) {
    extractChunks(k, layers[k], dataDir);
  }
}

function extractChunks(layerName, layerUrl, dataDir) {
  request({
     url: layerUrl,
     qs: {
       where: '1=1',
       returnIdsOnly: true,
       f: 'pjson'
     },
     method: 'GET'
   }, function(err, response, body) {
     var json = JSON.parse(body);
     var ids = json.objectIds;

     query(layerName, layerUrl, ids, dataDir);
   });
}

function query(layerName, layerUrl, ids, dataDir) {
  var requests = [];

  for (i=0; i < ids.length; i += 100) {
    var chunk = ids.slice(i, i + 100);
    var r = request({
      url: layerUrl,
      qs: {
        objectIds: chunk.join(','),
        geometryType: 'esriGeometryEnvelope',
        outSR: '4326',
        returnIdsOnly: false,
        returnGeometry: true,
        outFields: '*',
        f: 'pjson'
      },
      method: 'GET',
      json: true
    });

    requests.push(r);
  }

  q.allSettled(requests).then(function(results) {
    var data = null;

    for (i=0; i < results.length; i++) {
      if (i == 0) {
        data = results[i].value[0].body
      } else {
        data.features = data.features.concat(results[i].value[0].body.features);
      }
    }

    var path = dataDir + layerName + '.json';

    fs.writeFile(path, JSON.stringify(data), function(error) {
      var ogr = ogr2ogr(path);

      ogr.exec(function(err, data) {
        fs.writeFile(dataDir + layerName + '.geojson', JSON.stringify(data));
      });

    });
  });

}
