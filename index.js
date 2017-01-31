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
const AVS_PING_PERIOD = 5 * 60 * 1000

const wakeWordDetector = new WakeWordDetector()
const avsResponseHandler = new AvsResponseHandler(handleDirective, playAudio)
const SPEECH_RECORDING_TIMEOUT = 6000  // Stop recording speech at latest after this much time has passed
let speechRecordingTimer = undefined

registerForDirectives()
  .then(() => wakeWordDetector.start(sendSpeechRequest))
  .then(() => setInterval(sendPing, AVS_PING_PERIOD))

function sendSpeechRequest(audioStream) {
  speechRecordingTimer = setTimeout(() => { console.log('Cancelling due to timeout'); onStopCaptureDirective() }, SPEECH_RECORDING_TIMEOUT)
  return tokenProvider.getTokenAsync()
    .then(accessToken => {
      avsRequestUtils.createRecognizeSpeechRequest(audioStream, accessToken)
        .on('response', response => avsResponseHandler.handleResponse(response))
    })
}

function registerForDirectives() {
  return tokenProvider.getTokenAsync()
    .then(accessToken => {
      avsRequestUtils.avsGET('/directives', accessToken)
        .on('response', response => avsResponseHandler.handleResponse(response))
    })
}

function sendPing() {
  return tokenProvider.getTokenAsync()
    .then(accessToken => avsRequestUtils.avsPing(accessToken).on('response', response => console.log('Got PING response', response.statusCode)))
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

function onStopCaptureDirective() {
  clearTimeout(speechRecordingTimer)
  record.stop()
}



function playAudio(audioContentOpt) {
  if(!!audioContentOpt) {
    fs.writeFileSync('/tmp/output.mp3', audioContentOpt)
    player.play('/tmp/output.mp3', () => wakeWordDetector.start(sendSpeechRequest))
  } else {
    wakeWordDetector.start(sendSpeechRequest)
  }
}
