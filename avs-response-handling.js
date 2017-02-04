const _ = require('lodash')
const multiparty = require('multiparty')
const streamBuffers = require('stream-buffers')

function AvsResponseHandler(onDirectiveCallback, onAudioCallback) {
  this.onDirectiveCallback = onDirectiveCallback
  this.onAudioCallback = onAudioCallback
}

AvsResponseHandler.prototype.handleResponse = function (response) {
  const self = this
  const contentType = response.headers['content-type'] || ""

  if(isMultipart()) {
    handleMultipartResponse(response)
  } else if(isJson()) {
    handleJsonResponse(response)
  } else if(isOctetStream()) {
    handleBinaryResponse(response)
  } else if(response.statusCode === 204) {
    console.log('Got response 204')
    self.onAudioCallback(undefined)
  } else {
    console.log(`Unknown content type: ${contentType}, status: ${response.statusCode}, headers: ${JSON.stringify(response.headers)}`)
  }


  function handleMultipartResponse(response) {
    var form = new multiparty.Form()
    form.on('error', err => {
      if(err.message !== 'Request aborted' && err.message !== 'stream ended unexpectedly') {
        console.log('Error parsing response', err)
      }
    })
    form.on('part', function(part) {
      AvsResponseHandler.prototype.handleResponse.call(self, part)
    })

    form.parse(response)
  }

  function handleJsonResponse(response) {
    bufferResponse(response, buf => handleJsonMessage(JSON.parse(buf)))

    function handleJsonMessage(message) {
      if(message.directive) {
        self.onDirectiveCallback(message.directive)
      } else {
        console.log('Got unknown JSON message!', JSON.stringify(message, null, 2))
      }
    }
  }

  function handleBinaryResponse(response) {
    bufferResponse(response, buf => self.onAudioCallback(buf))
  }


  function isMultipart() { return _.includes(contentType, 'multipart/') }
  function isJson() { return _.includes(contentType, 'application/json') }
  function isOctetStream() { return _.includes(contentType, 'application/octet-stream') }
}


function bufferResponse(response, callback) {
  const buf = new streamBuffers.WritableStreamBuffer()
  response.pipe(buf)
  response.on('end', () => callback(buf.getContents()))
}


module.exports = AvsResponseHandler
