const record = require('node-record-lpcm16')
const {Detector, Models} = require('snowboy')

function WakeWordDetector() {
  this.running = false
  this.models = new Models()

  this.models.add({
    file: './resources/alexa.umdl',
    sensitivity: '0.5',
    hotwords: 'alexa'
  })
}

WakeWordDetector.prototype.start = function(wakeWordDetectedCallback) {
  if(this.running) {
    console.log('Already running wake word detection')
    return
  }
  console.log('Starting wake word detection..')

  const detector = new Detector({
    resource: "resources/common.res",
    models: this.models,
    audioGain: 2
  })

  detector.on('hotword', function(index, hotword) {
    console.log('Wake word detected:', index, hotword)
    mic.unpipe(detector)
    this.running = false
    wakeWordDetectedCallback(mic)
  })

  const mic = record.start({ threshold: 0, gain: 20 })
  mic.pipe(detector)
  this.running = true
}

module.exports = WakeWordDetector