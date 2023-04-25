const express = require('express')
const app = express()
const mongoose = require('mongoose')

// Here, we specify what database we want to use. This has no bearing on endpoints. In this case, the database is "packages"
// Mongoose handles the creation of the db if it does not exist
// The data will persist in the database even if this server is ever terminated
mongoose.connect('mongodb://127.0.0.1/packages', { useNewUrlParser: true }) 

// Here we connect to the specified database and log to the user that we did
const db = mongoose.connection
db.on('error', (error) => console.error(error))
db.once('open', () => console.log('Connected to Database'))

app.use(express.json())

// Here we define:
//      routers     - these define the HTTP requests handling (GET, POST, DELETE, etc.) and further endpoints from the specified endpoint
//      endpoints   - these are how the user connects to certain services. Ex. http://localhost:3000/packages connects to the packages endpoint
const packageRouter = require('./routes/package')
app.use('/package', packageRouter)

const authenticateRouter = require('./routes/authenticate')
app.use('/authenticate', authenticateRouter)

const packagesRouter = require('./routes/packages')
app.use('/packages', packagesRouter)

const resetRouter = require('./routes/reset')
app.use('/reset', resetRouter)


// Here we essentially "start" the server by having it listen on the port specified. Here, we use port 3000 which is a port commonly used for development. 
// For our purposes, this port should be fine because the ports aren't being used by anyone but us.
// Ports are 16-bit so they can be [0,65535] 
// Ports [0,1023] are reserved for well-known services like 22 for SSH, 80 for HTTP, etc.
app.listen(3000, () => console.log('Server started'))
