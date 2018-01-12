const aws = require('aws-sdk');
const s3 = new aws.S3({ apiVersion: '2006-03-01' });
const request = require('request');
const dynamodb = new aws.DynamoDB();
const uuid = require('uuid/v4');

exports.handler = function(event, context, callback) {
  // Setup image to send to s3
  var haystackBody;
  var number = uuid();
  var imageType = event.body.substring(event.body.lastIndexOf(":")+1,event.body.lastIndexOf(";"));
  var buf = new Buffer(event.body.replace(/^data:image\/\w+;base64,/, ""),'base64');
  var key;
  if ( imageType == "image/jpeg") {
    key = number + ".jpg";
  }
  else {
    key = number + ".png";
  }
  var bucket = "crushexpress-test";
  var data = {
    Bucket: bucket,
    Key: key,
    Body: buf,
    ContentEncoding: 'base64',
    ContentType: imageType,
    ACL: 'public-read'
  };
  // Send the image to s3
  s3.putObject(data, function(err, data){
    if (err) {
      console.log(err);
      console.log('Error uploading data: ', data);
    } else {
      console.log('succesfully uploaded the image!');
      // Send the image to haystack
      s3.getObject({ Bucket: bucket, Key: key, }, (err, data) => {
        if (err) {
            callback(err);
        }
        else {
          var img_etag = data.ETag;
          var img_contenttype = data.ContentType;
          var imgurl = "https://s3.us-east-2.amazonaws.com/" + bucket + "/" + key;
          // Send request to haystack
          var queryURL = 
          request({
            method: 'POST',
            uri: queryURL,
            body: data.Body,
            json: false
        }, function(error, response, body) {
            //console.log("Request Code: " + response)
            haystackBody = body;
            if (error) {
              console.log("HAYSTACK FAIL");
            } else {
              // Enrich data for storage
              console.log("HAYSTACK SUCCESS");
              console.log(body);

              let haystackreturn = JSON.parse(body);
              let ammountpeople = haystackreturn.people.length;
              console.log("people in photo", ammountpeople);
              let bulkarray = [];
              // loop to put everythin in array
              for (let i = 0; i < ammountpeople; i++) {
                bulkarray.push({
                  PutRequest: {
                    Item: {
                      'unique-id' : {
                        'S': uuid()
                      },
                      'image-etag': {
                          'S': img_etag
                      },
                      'image-type': {
                          'S': img_contenttype
                      },
                      'image-url': {
                          'S': imgurl
                      },
                      'image-isadultcontent': {
                          'BOOL': haystackreturn.adultContent.isAdultContent
                      },
                      'image-person-gender': {
                          'S': haystackreturn.people[i].gender.gender
                      },
                      'image-person-ethnicity': {
                          'S': haystackreturn.people[i].ethnicity.ethnicity
                      },
                      'image-person-age': {
                          'S': haystackreturn.people[i].age.toString()
                      },
                      'image-person-attractiveness': {
                          'S': haystackreturn.people[i].attractiveness.toString()
                      },
                      'image-face-index': {
                          'S': haystackreturn.people[i].index.toString()
                      },
                      'image-face-location-x': {
                          'S': haystackreturn.people[i].location.x.toString()
                      },
                      'image-face-location-y': {
                          'S': haystackreturn.people[i].location.y.toString()
                      },
                      'image-face-box-width': {
                          'S': haystackreturn.people[i].location.width.toString()
                      },
                      'image-face-box-height': {
                          'S': haystackreturn.people[i].location.height.toString()
                      }
                    }
                  }
                });
              }
              let bulkdbparams = {
                RequestItems: {
                  'crushexpress-db': bulkarray
                }
                };
                console.log("BULK DB PARAMS",bulkdbparams.RequestItems['crushexpress']);
                // Write array to DDB
                dynamodb.batchWriteItem(bulkdbparams, function(err, data) {
                  if (err) {
                    console.log("BULK DB WRITE ERROR",err);
                  }
                  else {
                    console.log("BULK DB WRITE SUCCESS");
                  }
                });
            }
            console.log("Haystack Return", body);

            var apibody = {
              'imageurl': imgurl,
              'haystack': haystackBody,
              'imageetag': img_etag.toString()
            };
            apibody = JSON.stringify(apibody);

              // API response
              var responseCode = 200;
              var api_response = {
                  statusCode: responseCode,
                  headers: {
                    "Access-Control-Allow-Origin" : "*",
                  },
                  body: apibody,
              };

              callback(null, api_response);
          });
          }
      });
    }
  });
};
