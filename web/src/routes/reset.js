// Here we are importing the Express library and creating an instance of a Router object from it
// Router objects are used to define the routing for the applications HTTP requests 
const express = require('express')
const reset_router = express.Router()

// Here we are importing the needed models for this endpoint
// Models represent collections in the database. They define the structure of the documents in the collection and provide an 
//      interface for querying, saving, updating, and deleting documents within the database error
const Package               = require('../models/package')
const PackageData           = require('../models/packageData')
const PackageHistoryEntry   = require('../models/packageHistoryEntry')
const PackageID             = require('../models/packageID')
const PackageMetadata       = require('../models/packageMetadata')
const PackageName           = require('../models/packageName')
const PackageQuery          = require('../models/packageQuery')
const PackageRating         = require('../models/packageRating')
const SemverRange           = require('../models/semverRange')
const User                  = require('../models/user')

// Here we define the routes for this endpoint
// This DELETE: Reset the registry to a system default state.
//      Responses defined as follows:
//          - 200: Registry is reset.
//          - 400: There is missing field(s) in the AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid.
//          - 401: You do not have permission to reset the registry.
// We are not supporting authentication so codes 400 & 401 do not take effect here
reset_router.delete('/', async (req,res) => {
    await Promise.all([
        Package.deleteMany({}),
        PackageData.deleteMany({}),
        PackageHistoryEntry.deleteMany({}),
        PackageID.deleteMany({}),
        PackageMetadata.deleteMany({}),
        PackageName.deleteMany({}),
        PackageQuery.deleteMany({}),
        PackageRating.deleteMany({}),
        SemverRange.deleteMany({}),
        User.deleteMany({})
    ]);
    res.status(200).json({ message: 'Registry is reset.' })
})

// Export the router as a module so other files can use it
module.exports = reset_router