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
      const req = avsPOSTMultipart('/events', 'this-is-a-boundary', accessToken)

      req.on('response', function(response) {
        handleResponse(response)
        response.on('end', () => wakeWordDetector.start())
      })

      req.on('error', function(response) {
        response.pipe(process.stderr)
      })

      req.write(jsonPart('--this-is-a-boundary', createRecognizeEvent()))
      req.write(audioPartStart('--this-is-a-boundary'))
      streamAudioFromMic(req)
    })
}


function registerForDirectives() {
  return tokenProvider.getTokenAsync()
    .then(accessToken => {
      const directivesReq = http.request(_.assign({}, url.parse(AVS_API_URL + '/directives'), {
          method: 'GET',
          headers: {
            authorization: 'Bearer ' + accessToken
          }
        })
      )

      directivesReq.on('response', function(response) {
        console.log('Got directives response', response.headers)
        handleResponse(response)
      })

      directivesReq.end()
    })
}


function handleResponse(response) {
  const contentType = response.headers['content-type'] || ""
  if(contentType.indexOf('multipart/') > -1) {
    var form = new multiparty.Form()
    form.on('error', function(err) {
      console.log('Error parsing response', err)
    })

    form.on('part', function(part) {
      const buf = new streamBuffers.WritableStreamBuffer()
      part.pipe(buf)
      part.on('end', () => {
        switch(part.headers['content-type']) {
          case 'application/json; charset=UTF-8':
            console.log('Got JSON:', JSON.stringify(JSON.parse(buf.getContentsAsString('utf8')), null, 2))
            break;
          case 'application/json':
            console.log('Got JSON:', JSON.stringify(JSON.parse(buf.getContentsAsString('utf8')), null, 2))
            record.stop()
            break;
          case 'application/octet-stream':
            //console.log('Got binary data, length: ', buf.getContents().length)
            fs.writeFileSync('./output.mp3', buf.getContents())
            player.play('./output.mp3')
            break;
          default:
            console.log('Got ' + part.headers['content-type'], buf.getContents().length)
            break;
        }
      })

      part.on('error', function(err) {
        console.log("Error on part " + part)
        part.resume()
      })
    })

    form.parse(response)
  } else if(contentType.indexOf('application/json') > -1) {
    const buf = new streamBuffers.WritableStreamBuffer()
    response.pipe(buf)
    response.on('end', () => {
      console.log('Got JSON:', JSON.stringify(JSON.parse(buf.getContentsAsString('utf8')), null, 2))
    })
  } else {
    console.log(`Unknown content type. Status: ${response.statusCode} Headers: ${response.headers}`)
  }
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


function jsonPart(boundary, json) {
  return boundary + '\nContent-Disposition: form-data; name="metadata\nContent-Type: application/json; charset=UTF-8\n\n' + JSON.stringify(json) + '\n'
}

function audioPartStart(boundary) {
  return boundary + `\nContent-Disposition: form-data; name="audio"\nContent-Type: application/octet-stream\n\n`
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
