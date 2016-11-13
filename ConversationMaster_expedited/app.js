/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

require( 'dotenv' ).config( {silent: true} );

var express = require( 'express' );  // app server
var bodyParser = require( 'body-parser' );  // parser for post requests
var watson = require( 'watson-developer-cloud' );  // watson sdk
var http = require('http');

// The following requires are needed for logging purposes
var uuid = require( 'uuid' );
var vcapServices = require( 'vcap_services' );
var basicAuth = require( 'basic-auth-connect' );

// The app owner may optionally configure a cloudand db to track user input.
// This cloudand db is not required, the app will operate without it.
// If logging is enabled the app must also enable basic auth to secure logging
// endpoints
var cloudantCredentials = vcapServices.getCredentials( 'cloudantNoSQLDB' );
var cloudantUrl = null;
if ( cloudantCredentials ) {
  cloudantUrl = cloudantCredentials.url;
}
cloudantUrl = cloudantUrl || process.env.CLOUDANT_URL; // || '<cloudant_url>';
var logs = null;
var app = express();

// Bootstrap application settings
app.use( express.static( './public' ) ); // load UI from public folder
app.use( bodyParser.json() );

// Create the service wrapper
var conversation = watson.conversation( {
  url: 'https://gateway.watsonplatform.net/conversation/api',
  username: process.env.CONVERSATION_USERNAME || '<username>',
  password: process.env.CONVERSATION_PASSWORD || '<password>',
  version_date: '2016-07-11',
  version: 'v1'
} );

// Endpoint to be call from the client side
app.post( '/api/message', function(req, res) {
  var workspace = process.env.WORKSPACE_ID || '<workspace-id>';
  if ( !workspace || workspace === '<workspace-id>' ) {
    return res.json( {
      'output': {
        'text': 'The app has not been configured with a <b>WORKSPACE_ID</b> environment variable. Please refer to the ' +
        '<a href="https://github.com/watson-developer-cloud/conversation-simple">README</a> documentation on how to set this variable. <br>' +
        'Once a workspace has been defined the intents may be imported from ' +
        '<a href="https://github.com/watson-developer-cloud/conversation-simple/blob/master/training/car_workspace.json">here</a> in order to get a working application.'
      }
    } );
  }
  var payload = {
    workspace_id: workspace,
    context: { "symptoms_list":[] },
    input: {}
  };
  if ( req.body ) {
    if ( req.body.input ) {
      payload.input = req.body.input;
    }
    if ( req.body.context ) {
      // The client must maintain context/state
      payload.context = req.body.context;
    }
  }
  // Send the input to the conversation service
  conversation.message( payload, function(err, data) {
    if ( err ) {
      return res.status( err.code || 500 ).json( err );
    }
    updateMessage(res, payload, data);
  } );
} );


var permanentSymptomList = new Array();

/**
 * Updates the response text using the intent confidence
 * @param  {Object} input The request to the Conversation service
 * @param  {Object} response The response from the Conversation service
 * @return {Object}          The response with the updated message
 */
function updateMessage(res, input, data) {
	
	// extract symptoms 
	var newSymptoms = extractSymptomList(data);
	permanentSymptomList = permanentSymptomList.concat(newSymptoms);
	console.log("Current symptoms list: " + permanentSymptomList);
	
	/** use one of these two lines depending on which way 
	of keeping track of symptoms we're using**/
	var symptomList = permanentSymptomList;
	//var symptomList = data.context.symptoms;
	
	// if there's a "no [more symptoms]" intent, then gather up the symptoms
	// and make a call to the Retrieve and Rank API
	if (hasIntent(data, "no")){
		symptomList = removeDuplicates(symptomList);

		// generate a retrieve & rank query by combining all the symptoms:
		//var collectionName = "Neurological";
		//var collectionName = "example_collection";
		var collectionName = "neuro_collection";
		var rankerID = "54922ax21-rank-20";
		var query = "";
		for (var i = 0; i < symptomList.length; i++){
			query += symptomList[i];
			if (i < symptomList.length - 1)
				query += " ";
		}
		console.log("retrieve & rank query: '" + query + "', collection: " + collectionName);
		if (symptomList.length < 1)
			console.log("Warning: request to Retrieve & Rank made with 0 symptoms!");
		
		var fullString = 'https://091d880c-9617-490f-a859-87a7c7b1b8ad:IhxEV2KTiY1B@'
			+ 'gateway.watsonplatform.net/retrieve-and-rank/api/v1/solr_clusters/scc'
			+ 'aa3604c_1f02_4567_8162_c15dfe749fdf/solr/' + collectionName + '/fcsel'
			+ 'ect?ranker_id=' + rankerID +'&q='+ query +'?&wt=json&fl=id,title';
		
		// perform the Retrieve & Rank API call:
		var https = require('https');
		https.get(fullString, function(resp){
			var chunkText = '';
			resp.on('data', function(chunk){
				chunkText+=chunk.toString('utf8');
			});
			resp.on('end', function(){
				var parseSuccess = Boolean(true);
				var mJSON;
				try {
					mJSON = JSON.parse(chunkText);
				} catch (err){
					parseSuccess = Boolean(false);
					console.log("Error parsing JSON response from Retrieve & Rank");
					console.log(err.message);
					console.log("Here is the R&R response that caused the problem:");
					console.log(chunkText);
				}
				if (parseSuccess){
					if (!mJSON.response)
						console.log("Error: the Retrieve & Rank HTTP request did not produce a valid JSON");
					else {
						if (mJSON.response.numFound == 0){
							console.log("Warning: the Retrieve & Rank request returned 0 documents for the query");
							data.output.text = "We did not find any diseases that were mentioned in conjunction with those symptoms.";
							return res.json(data);
						}
						else {
							var disorders = processJSON(mJSON);
							var insertionMarker = "<insert parsed JSON response here>";
							var currResponse = data.output.text;
							var newResponse = currResponse.join('').replace(insertionMarker, disorders);
							// make sure the substitution was made
							if (currResponse === newResponse){
								console.log("error - was unable to find marker '" + insertionMarker + "' in the response");
							}
							else {
								console.log("added the symptom list to the conversation response successfully");
							}
							// update the conversation response
							data.output.text = newResponse;
							return res.json(data);
						}
					}
				}
			});
		});
	}	
	// if there's no "no [more symptoms]" intent:
	else {
		console.log("got into the statement");
		var text = "" + input.input.text;
		if (text.includes("Fuck") || text.includes("fuck") || text.includes("shit")){
			console.log("looks like the user just cursed");
			data.output.text = "It's going to be fine. Sooner or later, we all die :)";
		}
		else if (text.includes("asshole")){
			data.output.text = "You and your physician may also want to look into: Anger Management Disorders";
		}
		return res.json(data);
	}
}

var key = "3a99ee3e5300e56f";


/** [EH] Gets a list of all the symptoms from the data object
 *		(returns an empty list if there aren't any) 
 */	
function extractSymptomList(data){
	var symptoms = new Array();
	for (var i = 0; i < data.entities.length; i++) {
		symptoms.push(data.entities[i].value);
	}
	return symptoms;
}

/** [EH] Helper method for removing duplicates from a list 
 */ 
function removeDuplicates(list){
	var listNoDuplicates = new Array();
	for (var i = 0; i < list.length; i++){
		var inListAlready = Boolean(false);
		for (var j = 0; j < listNoDuplicates.length; j++){
			if (list[i] === listNoDuplicates[j]){
				inListAlready = Boolean(true);
			}
		}
		if (!inListAlready){
			listNoDuplicates.push(list[i]);
		}
	}
	return listNoDuplicates;
}

/** [EH] Given a "data" JSON object, checks whether its intent list
 *		 contains an intent of the given name 
 */
function hasIntent(data, intentString){
	if (data.intents){
		for (var i = 0; i < data.intents.length; i++){
			if (data.intents[i].intent === intentString){
				return true;
			}
		}
		return false;
	}
	else {
		console.log("hasIntent error - data object has no intent field");
	}
}

/** [EH] Given a valid JSON response from Retrieve & Rank, extract
 *		 the important information.
 */
 function processJSON(json){
	console.log("---processing json response: " + json.response.numFound + " documents returned");
	var titleList = new Array();
	for (var i = 0; i < json.response.docs.length; i++){
		titleList.push("" + json.response.docs[i].title);
	}
	var disorderList = removeDuplicates(titleList);
	var listString = "";
	for (var i = 0; i < disorderList.length; i++){
		listString += " " + disorderList[i];
		if (i < disorderList.length - 2)
			listString += ",";
		else if (i == disorderList.length - 2){ // after second-to-last item
			if (i == 0){ // two-item list
				listString += " and";
			}
			else if (i > 0){
				listString += ", and";
			}
		}		
	}
	return listString;
 }


/** unnecessary stuff from Arman's project: **/


function checkWeather(data){
  return data.intents && data.intents.length > 0 && data.intents[0].intent === 'weather'
    && data.entities && data.entities.length > 0 && data.entities[0].entity === 'day';
}

function replaceParams(original, args){
  if(original && args){
    var text = original.join(' ').replace(/{(\d+)}/g, function(match, number) {
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
        ;
    });
    return [text];
  }
  return original;
}

function getLocationURL(lat, long){
  if(lat != null && long != null){
    return '/api/' + key + '/geolookup/forecast/q/'  + long + ',' + lat + '.json';
  }
};


/** from Arman's project...God knows what this stuff does **/


if ( cloudantUrl ) {
  // If logging has been enabled (as signalled by the presence of the cloudantUrl) then the
  // app developer must also specify a LOG_USER and LOG_PASS env vars.
  if ( !process.env.LOG_USER || !process.env.LOG_PASS ) {
    throw new Error( 'LOG_USER OR LOG_PASS not defined, both required to enable logging!' );
  }
  // add basic auth to the endpoints to retrieve the logs!
  var auth = basicAuth( process.env.LOG_USER, process.env.LOG_PASS );
  // If the cloudantUrl has been configured then we will want to set up a nano client
  var nano = require( 'nano' )( cloudantUrl );
  // add a new API which allows us to retrieve the logs (note this is not secure)
  nano.db.get( 'car_logs', function(err) {
    if ( err ) {
      console.error(err);
      nano.db.create( 'car_logs', function(errCreate) {
        console.error(errCreate);
        logs = nano.db.use( 'car_logs' );
      } );
    } else {
      logs = nano.db.use( 'car_logs' );
    }
  } );

  // Endpoint which allows deletion of db
  app.post( '/clearDb', auth, function(req, res) {
    nano.db.destroy( 'car_logs', function() {
      nano.db.create( 'car_logs', function() {
        logs = nano.db.use( 'car_logs' );
      } );
    } );
    return res.json( {'message': 'Clearing db'} );
  } );

  // Endpoint which allows conversation logs to be fetched
  app.get( '/chats', auth, function(req, res) {
    logs.list( {include_docs: true, 'descending': true}, function(err, body) {
      console.error(err);
      // download as CSV
      var csv = [];
      csv.push( ['Question', 'Intent', 'Confidence', 'Entity', 'Output', 'Time'] );
      body.rows.sort( function(a, b) {
        if ( a && b && a.doc && b.doc ) {
          var date1 = new Date( a.doc.time );
          var date2 = new Date( b.doc.time );
          var t1 = date1.getTime();
          var t2 = date2.getTime();
          var aGreaterThanB = t1 > t2;
          var equal = t1 === t2;
          if (aGreaterThanB) {
            return 1;
          }
          return  equal ? 0 : -1;
        }
      } );
      body.rows.forEach( function(row) {
        var question = '';
        var intent = '';
        var confidence = 0;
        var time = '';
        var entity = '';
        var outputText = '';
        if ( row.doc ) {
          var doc = row.doc;
          if ( doc.request && doc.request.input ) {
            question = doc.request.input.text;
          }
          if ( doc.response ) {
            intent = '<no intent>';
            if ( doc.response.intents && doc.response.intents.length > 0 ) {
              intent = doc.response.intents[0].intent;
              confidence = doc.response.intents[0].confidence;
            }
            entity = '<no entity>';
            if ( doc.response.entities && doc.response.entities.length > 0 ) {
              entity = doc.response.entities[0].entity + ' : ' + doc.response.entities[0].value;
            }
            outputText = '<no dialog>';
            if ( doc.response.output && doc.response.output.text ) {
              outputText = doc.response.output.text.join( ' ' );
            }
          }
          time = new Date( doc.time ).toLocaleString();
        }
        csv.push( [question, intent, confidence, entity, outputText, time] );
      } );
      res.csv( csv );
    } );
  } );
}

module.exports = app;
