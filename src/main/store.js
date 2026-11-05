const fs = require('node:fs')

// Small JSON file. Writes are synchronous and atomic so a session survives a
// crash or Windows shutting the app down mid-write.
function createStore(file, defaults) {
  return {
    load() {
      try {
        return { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) }
      } catch {
        return { ...defaults }
      }
    },
    save(data) {
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(data))
      fs.renameSync(`${file}.tmp`, file)
    },
  }
}

module.exports = { createStore }
