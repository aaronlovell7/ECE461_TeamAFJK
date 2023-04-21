// Here we are importing the Express library and creating an instance of a Router object from it
// Router objects are used to define the routing for the applications HTTP requests 
const express = require('express')
const packages_router = express.Router()

// Here we are importing the needed models for this endpoint
// Models represent collections in the database. They define the structure of the documents in the collection and provide an 
//      interface for querying, saving, updating, and deleting documents within the database
const PackageMetadata = require('../models/packageMetadata')
const PackageQuery = require('../models/packageQuery')

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
//      Responses defined as follows:
//          - default: unexpected error. Return 500
//          - 200: List(array) of packages
//              - Of type PackageMetaData schema
//          - 400: There is missing field(s) in the PackageQuery or it is formed improperly.
//          - 413: Too many packages returned
packages_router.post('/', async (req,res) => {
    const pagesize = 10         // just a number I chose, could not find anywhere in spec that designates this
    const maximum_413 = 100     // again, just a number i chose

    // Handle if there is an offset provided 
    let offset_skip = 0
    let offset = 0
    if(req.query.offset) {
        offset_skip = req.query.offset
        offset = offset_skip
    }

    // Parse JSON request body into iterable array
    const inputArray = req.body

    let newQuerySchema
    let is400Error = false
    let is500error = false
    let need_offset = false
    let noPackage = false
    let outputArray = []
    // Iterate through array, make schema from entry, satisfy query, move on to next
    for(let i = 0; inputArray.length != 0;) {
        // Load query into schema and validate it
        newQuerySchema = new PackageQuery (inputArray[i])
        try {
            await newQuerySchema.validate()
        } catch {
            res.status(400).json({ message: 'There is missing field(s) in the PackageQuery or it is formed improperly.'})
            is400Error = true
            break;
        }

        // If there is a version field
        if(!!newQuerySchema.Version) {
            if(newQuerySchema.Name == '*') { // find all packages
               try {
                    let results = await PackageMetadata.find({ Version: newQuerySchema.Version }).exec()
                    if(results) {
                        outputArray = outputArray.concat(results)
                    }
                    else {
                        noPackage = true
                    }
                } catch {
                    res.status(500).json({ message: 'Unknown error occurred.' })
                    is500error = true
                    break
                }
            }
            else {
                try {
                    let results = await PackageMetadata.find({ Name: newQuerySchema.Name, Version: newQuerySchema.Version }).exec()
                    if(results) {
                        outputArray = outputArray.concat(results)
                    }
                    else {
                        noPackage = true
                    }
                } catch {
                    res.status(500).json({ message: 'Unknown error occurred.' })
                    is500error = true
                    break
                }
            }
        }
        else { // No version, just search for name
            if(newQuerySchema.Name == '*') { // find all packages
                try {
                    let results = await PackageMetadata.find({}).exec()
                    if(results) {
                        outputArray = outputArray.concat(results)
                    }
                    else {
                        noPackage = true
                    }
                } catch {
                    res.status(500).json({ message: 'Unknown error occurred.' })
                    is500error = true
                    break
                }
            }
            else {
                try {
                    let results = await PackageMetadata.find({ Name: newQuerySchema.Name }).exec()
                    if(results) {
                        outputArray = outputArray.concat(results)
                    }
                    else {
                        noPackage = true
                    }
                } catch {
                    res.status(500).json({ message: 'Unknown error occurred.' })
                    is500error = true
                    break
                }
            }
        }

        // If too many packages have been found so far
        if(outputArray.length > maximum_413) {
            is400Error = true
            res.status(413).json({ message: 'Too many packages returned' })
            break
        }

        // For pagination
        if(offset_skip > 0) {
            if(noPackage) {   // No such package was found, move on
                offset_skip -= 1
                noPackage = false
            }
            else {
                let tmp = outputArray.length                // Store length before removing
                outputArray.splice(0, offset_skip)          // Remove offset_skip number of elements starting at index 0
                let num_removed = tmp - outputArray.length  // Calculate total number of elements removed in case offset_skip elements weren't there
                offset_skip -= num_removed                  // Update offset_skip for next query element
            }
        }

        inputArray.splice(0,1) // Remove satisfied query

        // If pagesize is met, no need to keep searching
        if(outputArray.length == pagesize) {
            break
        }
        else if(outputArray.length > pagesize) {    // Current query overflowed pagesize so need offset for next query
            need_offset = true
            break
        }
    }

    // If no errors, respond with array of metadata schema types
    if(!(is400Error | is500error)) {
        outputArray = outputArray.slice(0,pagesize) // Get first pagesize elements

        if(inputArray.length > 0 || need_offset) { // If more queries to satisfy or last query overflowed, return offset in header for next query
            let offset_header_value = offset + pagesize
            res.set('offset', offset_header_value).status(200).json(outputArray)
        }
        else {  // No need for offset header because no more queries to satisfy/no more results to show
            res.status(200).json(outputArray)
        }
    }
})

// Export the router as a module so other files can use it
module.exports = packages_router