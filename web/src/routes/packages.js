// Here we are importing the Express library and creating an instance of a Router object from it
// Router objects are used to define the routing for the applications HTTP requests 
const express = require('express')
const packages_router = express.Router()

// Here we are importing the needed models for this endpoint
// Models represent collections in the database. They define the structure of the documents in the collection and provide an 
//      interface for querying, saving, updating, and deleting documents within the database
const PackageMetadata = require('../models/packageMetadata')
const PackageQuery = require('../models/packageQuery')
const EnumerateOffset = require('../models/enumerateOffset')
// const Error = require('../models/error')
// const AuthenticationToken = require('../models/authenticationToken')

// Here we define the routes for this endpoint
// Per the spec, this POST: Gets any packages fitting the query. Search for packages satisfying the indicated query. If you want to enumerate all packages, provide an array 
// with a single PackageQuery whose name is "*". The response is paginated; the response header includes the offset to use in the next query.
//      The req.body will contain the array
//          - This is array of type PackageQuery schema
//      This endpoint can contain an offset for pagination
//          - If there, its of type EnumerateOffset schema
//          - If not there, returns first page of results
//          - Can find it in the query field by doing req.query.offset
//              - req.query returns value if exists or returns undefined if does not
//      The header will contain a parameter named 'X-Authorization'
//          - Can access headers by req.headers['X-Authorization']
//          - Of type AuthenticationToken schema
//      Responses defined as follows:
//          - default: unexpected error. Return type Error schema
//          - 200: List of packages
//          - 400: There is missing field(s) in the PackageQuery/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid.
//          - 413: Too many packages returned
packages_router.post('/', async (req,res) => {
    
})

// Export the router as a module so other files can use it
module.exports = packages_router