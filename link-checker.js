var phantom = require('phantom');
var async = require('async');
var fs = require('fs');
var LinkResult = require('./models/')

var resultsObj;
var sitepage = null;
var phInstance = null;
var ssCount = 0;
var jsonObj = {
    "url" : null,
    "device" : null,
    "status" : null,
    "duration" : null,
    "number" : null,
    "slowest_duration" : null,
    "slowest" : null,
    "largest" : null,
    "largest_size" : null,
    "size" : null,
    "error" : [],
    "blocked" : false
};   

function runPhantom(candidate, callback){    

    var start = null;

    phantom.create()

    .then(instance => {
        phInstance = instance;
        resultsObj = phInstance.createOutObject();
        resultsObj.results;

        // reset jsonObj
        jsonObj.url = null
        jsonObj.device = null
        jsonObj.status = null
        jsonObj.duration = null
        jsonObj.number = null
        jsonObj.slowest = null
        jsonObj.slowest_duration = null
        jsonObj.largest = null
        jsonObj.largest_size = null
        jsonObj.size = null
        jsonObj.error = [];
        jsonObj.blocked = false;

        return instance.createPage();
    })

    .then(page => {

        var resources = [];
      

        // On load started
        // Get the start time
        // Prints out message "load started"
        page.on('onLoadStarted', function(){
        
            if(!start){
                start = new Date().getTime();
            }

            console.log("---Load Started---");
        });


        // On resource requested
        // Creates a resouces[], array contains information for each resource
        page.on('onResourceRequested', function(requestData, networkRequest) {
            
            var now = new Date().getTime();

            resources[requestData.id] = {
                id: requestData.id,
                url: requestData.url,
                request: requestData,
                responses: {},
                duration: '-',
                times: {
                  request: now
                },
                statusCode: '   ',
                error : '',
                timedout : false
            }

            if(!start || now < start){
                start = now;
            }

        });


        // On resource received
        // Get the resource from resources array using response.id
        // Update the status code for resources
        // Calculate the duration for loading a resource 
        // Update the size for resources using response.bodysize
        page.on('onResourceReceived', function(response){

            var now = new Date().getTime(),
                resource = resources[response.id];

            if(resource.statusCode == '   '){
                resource.statusCode = response.status;
            }

            resource.responses[response.stage] = response;

            if(!resource.times[response.stage]){
                  resource.times[response.stage] = now;
                  resource.duration = now - resource.times.request;
            }    

            if (response.bodySize) {
                    resource.size = response.bodySize;
                } else if (!resource.size) {
                    response.headers.forEach(function (header) {
                        
                        if (header.name.toLowerCase()=='content-length') {
                            resource.size = parseInt(header.value);
                        }
                });
            }
        });


        // On resource error
        // Get resouce by using resourceError.id
        // update the error for a resource
        // Update the status code for a resource
        // If the error resource is the first resource, the website is blocked.
        // Set the blocked attribute in jsonObj to true
        page.on('onResourceError', function(resourceError){

            var resource = resources[resourceError.id];

            resource.error =  {
                'url' : resourceError.url, 
                'error_type' : resourceError.errorString, 
                'error_code' : resourceError.errorCode
            }

            if(resource.statusCode !== 408){
                resource.statusCode = 'err';
            }

            // If the first resource has error then the url is blocked
            if(resourceError.id == 1){
                jsonObj.blocked = true;
            }
        });


        // On Resource timeout
        // Get resource by request.id
        // Update the status code for resource
        // If the first resouce timedout then the url is blocked, update the blocked attribute
        page.on('onResourceTimeout', function(request){

            var resource = resources[request.id];

            resource.timedout = true;
            resource.statusCode = request.errorCode;

            // If the first resource timedout then the url is blocked
            if(request.id == 1){
              jsonObj.blocked = true;
            }
        });


        // On load finished
        // prints out the message "load finished"
        // Take a screenshot of the webpage
        // Calculate the size, and duration for resources
        // Set the return jsonObj to the correct value
        // Export the result jsonObj from Phantom to Node
        page.on('onLoadFinished', function(status, out){

            console.log('---load finished---');

            // todo: name each screenshot differently


            /*var screenshot = candidate + '.png';
            console.log(screenshot);

            page.render('./screenshot/abc.png');
            ssCount++;*/

            var finish =  new Date().getTime(),
                slowest, fastest, totalDuration = 0,
                largest, smallest, totalSize = 0,
                missingSize = false,
                elapsed = finish - start;

            resources.forEach(function (resource) {
                if (!resource.times.start) {
                    resource.times.start = resource.times.end;
                }
                if (!slowest || resource.duration > slowest.duration) {
                    slowest = resource;
                }
                if (!fastest || resource.duration < fastest.duration) {
                    fastest = resource;
                }
                if(resource.duration != '-'){
                    totalDuration += resource.duration;
                }
                if (resource.size) {
                    if (!largest || resource.size > largest.size) {
                        largest = resource;
                    }
                    if (!smallest || resource.size < smallest.size) {
                        smallest = resource;
                    }
                    totalSize += resource.size;
                } else {
                    resource.size = '-';
                    missingSize = true;
                }
            })

            
            jsonObj.status = status;
            jsonObj.url = candidate;
            jsonObj.duration = elapsed;// in ms
            jsonObj.number = resources.length - 1;
            jsonObj.slowest_duration = slowest.duration;// in ms
            jsonObj.slowest = slowest.url;
            if(largest != null){
                jsonObj.largest_size = largest.size;// in bytes
                jsonObj.largest = largest.url
            }
            jsonObj.size = totalSize; 
   
            resources.forEach(function (resource) {
               if(resource.error !== ''){ 
                    jsonObj.error.push(resource.error);
                }
              
                console.log(
                    pad(resource.id, 3) + '. ' +
                    pad('Status ' + resource.statusCode, 3) +
                    pad(resource.duration, 6) + 'ms; ' +
                    pad(resource.size, 7) + 'b; ' +
                    truncate(resource.url, 84)
                );  
            });

            out.results = jsonObj;

        }, resultsObj);
        // End of load finished
        

        // ============================================================
        sitepage = page;

        // set resource timeout to 8 seconds
        page.setting('resourceTimeout', 8000);
        // set device to "iphone"
        page.setting('userAgent', "iphone");

        jsonObj.device = "iphone";

        console.log('');
        console.log('==================================================')
        console.log('loading page: ' + candidate);

        return page.open(candidate);
    })


    .then(function(status) {

        console.log('');
        console.log('---------------------------------')
        console.log(JSON.stringify(jsonObj, null, 2));
        console.log('---------------------------------')

        return sitepage.property('content');
    })


    .then(content => {
        callback();
        sitepage.close();
        phInstance.exit();
    })


    .catch(error => {
        console.log('Error: ' + error);
        phInstance.exit();
    });
}


exports.linkChecker = function(url, cb){

    // Reset the resultArr
    var resultsArr = [];

    // todo
    if( ! checkUrl(url) ){
        return cb(true);
    }

    console.log('checking ' + url.length + ' urls');

    // run the function for each url
    // runs only a single async operation at a time.
    async.eachSeries(url/*array of urls*/, function(url, next)/*function to run for each url*/ {

        // create a new phantom instance
        runPhantom(url, function(urls){

            // get the original variable instead of the reference one
            var copyResult = Object.assign(resultsObj.results, {});

            var saveResult = {
                url : copyResult.url,
                device : copyResult.device,
                status : copyResult.status,
                size : copyResult.size,
                duration: copyResult.duration,
                number : copyResult.number,
                slowest : copyResult.slowest,
                slowest_duration: copyResult.slowest_duration,
                largest : copyResult.largest,
                largest_size : copyResult.largest_size,
                error : copyResult.error,
                blocked : copyResult.blocked,
            };

            resultsArr.push(saveResult);
            next();
        });

    }, function(err) {

        console.log('-----------resultsArr-------------');
        console.log(JSON.stringify(resultsArr, null, 2));
        console.log('')
        console.log('---finshed checking---')
        console.log('');

        return cb(null, resultsArr);
    });
}




// todo : Check the validity of the input
// ==================================
 var checkUrl = function(url){

    if(!url){
        return false;
    }

    return true;
    // check the format of the input
 }   




// Functions for formating console logs
// ==================================================
var truncate = function (str, length) {
        length = length || 80;
        if (str.length <= length) {
            return str;
        }
        var half = length / 2;
        return str.substr(0, half-2) + '...' + str.substr(str.length-half+1);
    },

    pad = function (str, length) {
        var padded = str.toString();
        if (padded.length > length) {
            return pad(padded, length * 2);
        }
        return repeat(' ', length - padded.length) + padded;
    },

    repeat =  function (chr, length) {
        for (var str = '', l = 0; l < length; l++) {
            str += chr;
        }
        return str;
    };
