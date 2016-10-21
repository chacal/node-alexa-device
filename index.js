const http = require('http2')
const url = require('url')
const _ = require('lodash')
const fs = require('fs')
const multiparty = require('multiparty')
const streamBuffers = require('stream-buffers')
const player = require('play-sound')()
const record = require('node-record-lpcm16')
const BPromise = require('bluebird')
const TokenProvider = require('refresh-token')
const WakeWordDetector = require('./wakeword-detector.js')

const AVS_API_URL = 'https://avs-alexa-na.amazon.com/v20160207'
const AVS_CREDENTIALS = JSON.parse(fs.readFileSync('./avs-credentials.json'))
const tokenProvider = BPromise.promisifyAll(new TokenProvider('https://api.amazon.com/auth/o2/token', AVS_CREDENTIALS))

const wakeWordDetector = new WakeWordDetector()

registerForDirectives()
  .then(() => wakeWordDetector.start(sendSpeechRequest))


function sendSpeechRequest() {
  return tokenProvider.getTokenAsync()
    .then(accessToken => {
      const BOUNDARY = uuid()
      const req = avsPOSTMultipart('/events', BOUNDARY, accessToken)
      req.write(jsonPart(BOUNDARY, createRecognizeEvent()))
      req.write(audioPartStart(BOUNDARY))
      streamAudioFromMic(req)

      req.on('response', function(response) {
        handleResponse(response)
        response.on('end', () => wakeWordDetector.start(sendSpeechRequest))
      })

      req.on('error', function(response) {
        response.pipe(process.stderr)
      })
    })
}


function registerForDirectives() {
  return tokenProvider.getTokenAsync()
    .then(accessToken => {
      avsGET('/directives', accessToken).on('response', function(response) {
        handleResponse(response)
      })
    })
}


function handleResponse(response) {
  const contentType = response.headers['content-type'] || ""

  if(isMultipart()) {
    handleMultipartResponse(response)
  } else if(isJson()) {
    handleJsonResponse(response)
  } else if(isOctetStream()) {
    handleBinaryResponse(response)
  } else {
    console.log(`Unknown content type: ${contentType}, status: ${response.statusCode}, headers: ${response.headers}`)
  }

  function isMultipart() { return _.includes(contentType, 'multipart/') }
  function isJson() { return _.includes(contentType, 'application/json') }
  function isOctetStream() { return _.includes(contentType, 'application/octet-stream') }
}

function handleMultipartResponse(response) {
  var form = new multiparty.Form()
  form.on('error', function(err) {
    console.log('Error parsing response', err)
  })

  form.on('part', function(part) {
    handleResponse(part)
  })

  form.parse(response)
}

function handleJsonResponse(response) {
  const buf = new streamBuffers.WritableStreamBuffer()
  response.pipe(buf)
  response.on('end', () => {
    handleJsonMessage(JSON.parse(buf.getContentsAsString('utf8')))
  })
}

function handleBinaryResponse(response) {
  response.pipe(fs.createWriteStream('./output.mp3'))
  response.on('end', () => player.play('./output.mp3'))
}



function handleJsonMessage(message) {
  if(message.directive) {
    handleDirective(message.directive)
  } else {
    console.log('Got unknown JSON message!', JSON.stringify(message, null, 2))
  }

  function handleDirective(directive) {
    if(directive.header.name === 'StopCapture') {
      onStopCaptureDirective()
    } else if(directive.header.name === 'Speak') {
      // Don't need to handle, binary content will be played back automatically when it arrives
    } else {
      console.log('Got unknown directive!', JSON.stringify(directive, null, 2))
    }
  }
}

function onStopCaptureDirective() { record.stop() }


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

function avsGET(path, accessToken) {
  return http.request(_.assign({}, url.parse(AVS_API_URL + path), {
    method: 'GET',
    headers: { authorization: 'Bearer ' + accessToken }
  }))
}


function jsonPart(boundary, json) {
  return '--' + boundary + '\nContent-Disposition: form-data; name="metadata\nContent-Type: application/json; charset=UTF-8\n\n' + JSON.stringify(json) + '\n'
}

function audioPartStart(boundary) {
  return '--' + boundary + `\nContent-Disposition: form-data; name="audio"\nContent-Type: application/octet-stream\n\n`
}

function streamAudioFromMic(request) {
  const recording = record.start()
  recording.on('data', data => request.write(data))
  recording.on('end', () => request.end())
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

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8)
    return v.toString(16)
  })
}
