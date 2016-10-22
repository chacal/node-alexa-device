const record = require('node-record-lpcm16')
const {Detector, Models} = require('snowboy')

function WakeWordDetector() {
  this.models = new Models()

  this.models.add({
    file: './resources/alexa.umdl',
    sensitivity: '0.5',
    hotwords: 'alexa'
  })
}

WakeWordDetector.prototype.start = function(wakeWordDetectedCallback) {
  console.log('Starting wake word detection..')

  const detector = new Detector({
    resource: "resources/common.res",
    models: this.models,
    audioGain: 2
  })

  detector.on('hotword', function(index, hotword) {
    console.log('Wake word detected:', index, hotword)
    mic.unpipe(detector)
    wakeWordDetectedCallback(mic)
  })

  const mic = record.start({ threshold: 0 })
  mic.pipe(detector)
}

module.exports = WakeWordDetector