const http = require('http2')
const url = require('url')
const _ = require('lodash')

const AVS_BASE_URL = 'https://avs-alexa-na.amazon.com'
const AVS_API_URL = AVS_BASE_URL + '/v20160207'
var bunyan = require('bunyan')

http.globalAgent = new http.Agent({
  rejectUnauthorized: true,
  log: bunyan.createLogger({
    name: "node-alexa",
    level: 'debug',
    serializers: http.serializers
  })
})

function createSynchronizeStateRequest(accessToken) {
  const BOUNDARY = uuid()
  const req = avsPOSTMultipart('/events', BOUNDARY, accessToken)
  req.write(jsonPart(BOUNDARY, createSynchronizeStateEvent()))
  req.write('\n')
  req.end(BOUNDARY + '\n')
  return req
}

function createRecognizeSpeechRequest(audioStream, accessToken) {
  const BOUNDARY = uuid()
  const req = avsPOSTMultipart('/events', BOUNDARY, accessToken)
  req.write(jsonPart(BOUNDARY, createRecognizeEvent()))
  req.write(audioPartStart(BOUNDARY))
  audioStream.pipe(req)

  req.on('error', function(response) {
    response.pipe(process.stderr)
  })

  return req
}



function avsPOSTMultipart(path, boundary, accessToken) {
  return http.request(_.assign({}, url.parse(AVS_API_URL + path), {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + accessToken,
        'content-type': `multipart/form-data; boundary=${boundary}`
      }
    })
  )
}

function avsGET(path, accessToken) { return doAvsGet(AVS_API_URL + path, accessToken) }
function avsPing(accessToken) { return doAvsGet(AVS_BASE_URL + '/ping', accessToken) }

function doAvsGet(path, accessToken) {
  const req = http.request(_.assign({}, url.parse(path), {
    method: 'GET',
    headers: { authorization: 'Bearer ' + accessToken }
  }))
  req.on('error', error => console.log('Got error!', error))
  req.setSocketKeepAlive(true)
  req.setTimeout(60 * 60 * 1000, () => console.log("Got socket timeout!"))
  return req
}



function createSynchronizeStateEvent() {
  return {
    "context": [
      {
        "header": {
          "namespace": "Alerts",
          "name": "AlertsState"
        },
        "payload": {
          "allAlerts": [],
          "activeAlerts": []
        }
      },
      {
        "header": {
          "namespace": "AudioPlayer",
          "name": "PlaybackState"
        },
        "payload": {
          "token": "",
          "offsetInMilliseconds": 0,
          "playerActivity": "IDLE"
        }
      },
      {
        "header": {
          "namespace": "Speaker",
          "name": "VolumeState"
        },
        "payload": {
          "volume": 50,
          "muted": false
        }
      },
      {
        "header": {
          "namespace": "SpeechSynthesizer",
          "name": "SpeechState"
        },
        "payload": {
          "token": "",
          "offsetInMilliseconds": 0,
          "playerActivity": "FINISHED"
        }
      }
    ],
    "event": {
      "header": {
        "namespace": "System",
        "name": "SynchronizeState",
        "messageId": uuid(),
      },
      "payload": {}
    }
  }
}

function createRecognizeEvent() {
  return {
    "event": {
      "header": {
        "namespace": "SpeechRecognizer",
        "name": "Recognize",
        "messageId": uuid(),
        "dialogRequestId": uuid()
      },
      "payload": {
        "profile": "NEAR_FIELD",
        "format": "AUDIO_L16_RATE_16000_CHANNELS_1"
      }
    }
  }
}

function jsonPart(boundary, json) {
  return '--' + boundary + '\nContent-Disposition: form-data; name="metadata"\nContent-Type: application/json; charset=UTF-8\n\n' + JSON.stringify(json) + '\n'
}

function audioPartStart(boundary) {
  return '--' + boundary + `\nContent-Disposition: form-data; name="audio"\nContent-Type: application/octet-stream\n\n`
}



function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8)
    return v.toString(16)
  })
}


module.exports = {
  createSynchronizeStateRequest,
  createRecognizeSpeechRequest,
  avsGET,
  avsPing
}