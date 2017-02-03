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
const AVS_PING_PERIOD = 2 * 60 * 1000

const wakeWordDetector = new WakeWordDetector()
const avsResponseHandler = new AvsResponseHandler(handleDirective, playAudio)
const SPEECH_RECORDING_TIMEOUT = 6000  // Stop recording speech at latest after this much time has passed
let speechRecordingTimer = undefined

const LED_GPIO_PIN = 1
const led = process.platform === 'linux' ? chipGpio(LED_GPIO_PIN) : noopGpio()

registerForDirectives()
  .then(sendSynchronizeState)
  .then(() => wakeWordDetector.start(sendSpeechRequest))
  .then(() => setInterval(sendPing, AVS_PING_PERIOD))
  .then(() => setInterval(sendSynchronizeState, 2 * AVS_PING_PERIOD))
  .then(turnLedOff)
  .then(() => process.on('SIGINT', exit))

function sendSynchronizeState() {
  return tokenProvider.getTokenAsync()
    .then(accessToken => avsRequestUtils.createSynchronizeStateRequest(accessToken)
      .on('response', response => avsResponseHandler.handleResponse(response))
    )
}

function sendSpeechRequest(audioStream) {
  turnLedOn()
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
  console.log('Sending PING..')
  return tokenProvider.getTokenAsync()
    .then(accessToken => avsRequestUtils.avsPing(accessToken)
      .on('response', response => {
        console.log('Got PING response', response.statusCode)
        response.socket.reset('NO_ERROR')  // Close the stream to avoid exceeding AVS' max limit of 10 open simultaneous streams
      })
    )
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
  turnLedOff()
}



function playAudio(audioContentOpt) {
  if(!!audioContentOpt) {
    fs.writeFileSync('/tmp/output.mp3', audioContentOpt)
    player.play('/tmp/output.mp3', () => wakeWordDetector.start(sendSpeechRequest))
  } else {
    wakeWordDetector.start(sendSpeechRequest)
  }
}


function chipGpio(pin) { return new require('chip-gpio').Gpio(pin, 'out') }
function noopGpio() { return { write: _.noop, unexport: _.noop  }}

function exit() {
  turnLedOff()
  led.unexport()
  process.exit()
}

function turnLedOn() { led.write(0) }
function turnLedOff() { led.write(1) }