const { execFile } = require('node:child_process');


execFile('./461_CLI/route_run', ['https://github.com/nullivex/nodist'], (err, stdout, stderr) => {
    //console.log(stdout)
    const out = JSON.parse(stdout)
    console.log(out)
    //console.log(stderr)
})

let text = "https://github.com/nullivex/nodist"
let text2 = "https://www.npmjs.com/package/express"

elem1 = text.split('/')
elem2 = text2.split('/')

console.log(elem1.includes('github.com'))
console.log(elem2.includes('www.npmjs.com'))

