const _ = require('lodash')
const fs = require('fs')
const player = require('play-sound')()
const record = require('node-record-lpcm16')
const BPromise = require('bluebird')
const TokenProvider = require('refresh-token')
const WakeWordDetector = require('./wakeword-detector.js')
const AvsResponseHandler = require('./avs-response-handling.js')
const avsRequestUtils = require('./avs-request-utils.js')

const AVS_CREDENTIALS = require('./avs-credentials.json')
const tokenProvider = BPromise.promisifyAll(new TokenProvider('https://api.amazon.com/auth/o2/token', AVS_CREDENTIALS))

const wakeWordDetector = new WakeWordDetector()
const avsResponseHandler = new AvsResponseHandler(handleDirective, handleAudio)

registerForDirectives()
  .then(() => wakeWordDetector.start(sendSpeechRequest))


function sendSpeechRequest() {
  return tokenProvider.getTokenAsync()
    .then(accessToken => {
      avsRequestUtils.createRecognizeSpeechRequest(record.start(), accessToken).on('response', response => {
        avsResponseHandler.handleResponse(response)
      })
    })
}


function registerForDirectives() {
  return tokenProvider.getTokenAsync()
    .then(accessToken => {
      avsRequestUtils.avsGET('/directives', accessToken).on('response', response => {
        avsResponseHandler.handleResponse(response)
      })
    })
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

function onStopCaptureDirective() { record.stop() }



function handleAudio(audioContent) {
  fs.writeFileSync('./output.mp3', audioContent)
  player.play('./output.mp3', () => wakeWordDetector.start(sendSpeechRequest))
}
