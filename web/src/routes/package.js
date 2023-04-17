// Here we are importing the Express library and creating an instance of a Router object from it
// Router objects are used to define the routing for the applications HTTP requests 
const express = require('express')
const package_router = express.Router()

// Here we are importing our ID generator
const { v4: uuidv4 } = require('uuid')

// Here we are importing the node-zip library to use for extracting data from zip files
const JSZip = require('jszip')

// Here we are importing the needed models for this endpoint
// Models represent collections in the database. They define the structure of the documents in the collection and provide an 
//      interface for querying, saving, updating, and deleting documents within the database error
const PackageData = require('../models/packageData')
const Package = require('../models/package')
const PackageID = require('../models/packageID')
const PackageRating = require('../models/packageRating')
const Error = require('../models/error')
const PackageName = require('../models/packageName')
const PackageRegEx = require('../models/packageRegEx')
const PackageMetadata = require('../models/packageMetadata')

// Here we define the routes for this endpoint
// Per spec, this POST: Creates package
//      The req.body will contain PackageData schema
//      Responses defined as follows:
//          - 201: Success. Check the ID in the returned metadata for the official ID.
//              - Return type is of Package schema
//          - 400: There is missing field(s) in the PackageData/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid.
//          - 409: Package exists already.
//          - 424: Package is not uploaded due to the disqualified rating.
package_router.post('/', async (req,res) => {
    // This validates that the req.body conforms to the PackageData schema
    const newPackageDataSchema = new PackageData(req.body)
    let isValid = true
    try {
        await newPackageDataSchema.validate()
    }
    catch {
        isValid = false
        res.status(400).json({ message: 'There is missing field(s) in the PackageData/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid.'})
    }

    if(isValid) {
        // Our own validation to find out what we are doing (Upload or ingestion)
        if((!!newPackageDataSchema.Content) ^ (!!newPackageDataSchema.URL)) {
            if(newPackageDataSchema.Content) { // zip file upload
                // Check if package exists already
                if(await PackageData.findOne({ Content: newPackageDataSchema.Content })) {
                    res.status(409).json({ message: 'Package exists already.' })
                }
                else {
                    // Create unique ID and make PackageID schema
                    let ID = uuidv4();
                    while(await PackageID.findOne({ PackageID: ID }) != null) {
                        ID = uuidv4();
                    }
                    const newPackageIDSchema = new PackageID({
                        PackageID: ID
                    })

                    // Get name and version from package.json
                    const base64Content = newPackageDataSchema.Content
                    let newName
                    let newVersion
                    let zipError = false
                    try {
                        // Decode content, extract package.json, then extract name and version from it
                        const decodedContent = Buffer.from(base64Content, 'base64')
                        const zip = await JSZip.loadAsync(decodedContent)
                        const packageJSON = await zip.file('package.json').async('string')
                        newName = JSON.parse(packageJSON).name
                        if(!newName) newName = ID
                        newVersion = JSON.parse(packageJSON).version
                        if(!newVersion) newVersion = "1.0.0"
                    }
                    catch {
                        // Per piazza post 196
                        zipError = true;
                        res.status(400).json({ message: 'No package.json in module.'})
                    }

                    if(!zipError) {
                        // Create packageName schema
                        const newPackageNameSchema = new PackageName ({
                            PackageName: newName
                        })

                        await newPackageNameSchema.save()
                        await newPackageDataSchema.save()
                        await newPackageIDSchema.save()

                        // Create packageMetadata schema
                        const newPackageMetadataSchema = new PackageMetadata ({
                            Name: newPackageNameSchema._id,
                            Version: newVersion,
                            ID: newPackageIDSchema._id
                        })

                        await newPackageMetadataSchema.save()

                        // Create package schema
                        const newPackageSchema = new Package ({
                            metadata: newPackageMetadataSchema._id,
                            data: newPackageDataSchema._id
                        })

                        const newPackage = await newPackageSchema.save()

                        res.status(201).json(newPackage)
                    }
                }
            }
            else { // ingestion

            }
        }
        else {
            res.status(400).json({ message: 'There is missing field(s) in the PackageData/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid.' })
        }
    }
})

// Per spec, this GET: Interact with the package with this ID. Return this package.
//      The req.params will contain the id of the package
//          - Can access by req.params.id
//          - Will be of type PackageID schema
//      Responses defined as follows:
//          - default: unexpected error. Return type Error schema
//          - 200: Return the package. Content is required.
//              - Return type is of Package schema
//          - 400: There is missing field(s) in the PackageID/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid.
//          - 404: Package does not exist.
package_router.get('/:id', async(req,res) => {
    const curPackage = await Package.findById({ _id: req.params.id})
    const curPackageData = await PackageData.findById(curPackage.data)
    const curPackageMetadata = await PackageMetadata.findById(curPackage.metadata)
    const curPackageName = await PackageName.findById(curPackageMetadata.Name)
    const curPackageID = await PackageID.findById(curPackageMetadata.ID)

    let isValid = true
    // try {
    //     const curPackageName = await PackageName.findById(curPackageMetadata.Name)

    //     //res.json({ metadataID: curPackageMetadata._id, packageData: curPackageData._id, packageName: curPackageName._id })

    // }
    // catch (err) {
    //     isValid = false
    //     res.status(400).json({ message: 'There is missing field(s) in the PackageID/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid.'})
    // }

    try {
        await curPackageData.validate()
    }
    catch (err) {
        isValid = false
        res.status(404).json({ message: "Package does not exist." })
    }

    if (isValid) {

        var returnMetadata = {
            "Name": curPackageName.PackageName,
            "Version": curPackageMetadata.Version,
            "ID": curPackageID.PackageID
        }

        var returnData = {
            "Content": curPackageData.Content,
            "URL": curPackageData.URL,
            "JSProgram": curPackageData.JSProgram
        }        

        res.json({ metadata: returnMetadata, data: returnData})
    }
})

// TEMPORARY

package_router.get('/', async (req, res) => {
    try {
        const packages = await PackageData.find()
        res.json(packages)
    }
    catch (err) {
        res.status(500)
    }
})

// END TEMPORARY

// Per spec, this PUT: Update this content of the package. The name, version, and ID must match. The package contents (from PackageData) will replace the previous contents.
//      The req.body will contain Package schema
//      The req.params will contain the id of the package
//          - Can access by req.params.id
//          - Will be of type PackageID schema
//      Responses defined as follows:
//          - 200: Version is updated.
//          - 400: There is missing field(s) in the PackageID/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid.
//          - 404: Package does not exist.
package_router.put('/:id', async(req,res) => {
    const curPackage = await Package.findById({ _id: req.params.id})
    const curPackageData = await PackageData.findById(curPackage.data)
    const curPackageMetadata = await PackageMetadata.findById(curPackage.metadata)
    const curPackageName = await PackageName.findById(curPackageMetadata.Name)
    const curPackageID = await PackageID.findById(curPackageMetadata.ID)

    const newPackageDataSchema = new PackageData(req.body)
    let isValid = true;
    try {
        await newPackageDataSchema.validate()
    }
    catch {
        isValid = false;
        res.status(400).json({ message: "There is missing field(s) in the PackageID/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid." })
    }

    if(isValid) {
        // Get name and version from package.json
        const base64Content = newPackageDataSchema.Content
        let newName
        let newVersion
        let zipError = false
        try {
            // Decode content, extract package.json, then extract name and version from it
            const decodedContent = Buffer.from(base64Content, 'base64')
            const zip = await JSZip.loadAsync(decodedContent)
            const packageJSON = await zip.file('package.json').async('string')
            newName = JSON.parse(packageJSON).name
            if(!newName) newName = ID
            newVersion = JSON.parse(packageJSON).version
            if(!newVersion) newVersion = "1.0.0"
        }
        catch {
            // Per piazza post 196
            zipError = true;
            res.status(400).json({ message: 'No package.json in module.'})
        }

        if (newName == curPackageName.PackageName && newVersion == curPackageMetadata.Version) {
            // Need to make sure that ID matches as well, not sure how to do this with our current set up

            // Update data in old package with new one
            const updatedData = await PackageData.findByIdAndUpdate( 
                { _id: curPackage.data }, 
                { Content: newPackageDataSchema.Content })
            
            res.status(200).json({ message: "Version is updated." })
        }
    }
})

// Per spec, this DELETE: Delete this version of the package.
//      The req.params will contain the id of the package
//          - Can access by req.params.id
//          - Will be of type PackageID schema
//      Responses as follows:
//          - 200: Package is deleted.
//          - 400: There is missing field(s) in the PackageID/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid.
//          - 404: Package does not exist.
package_router.delete('/:id', async(req,res) => {
    const curPackage = await Package.findById({ _id: req.params.id})
    const curPackageData = await PackageData.findById(curPackage.data)
    const curPackageMetadata = await PackageMetadata.findById(curPackage.metadata)
    const curPackageName = await PackageName.findById(curPackageMetadata.Name)
    const curPackageID = await PackageID.findById(curPackageMetadata.ID)

    let isValid = true
    try {
        await curPackage.validate()
    }
    catch (err) {
        isValid = false
        res.status(404).json({ message: "Package does not exist." })
    }
    if (isValid) {
        await Promise.all([
            Package.deleteMany(curPackage._id),
            PackageData.deleteMany(curPackageData._id),
            PackageMetadata.deleteMany(curPackageMetadata._id),
            PackageName.deleteMany(curPackageName._id),
            PackageID.deleteMany(curPackageID._id)
        ]);

        res.status(200).json({ message: "Package is deleted." })
    }
})

// Per spec, this GET: Rates package
//      The req.params will contain the id of the package
//          - Can access by req.params.id
//          - Will be of type PackageID schema
//      Responses as follows:
//          - 200: Return the rating. Only use this if each metric was computed successfully.
//              - Return type of PackageRating schema
//          - 400: There is missing field(s) in the PackageID/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid
//          - 404: Package does not exist.
//          - 500: The package rating system choked on at least one of the metrics.
package_router.get('/:id/rate', async(req,res) => {

})

// Per spec, this GET: Return the history of this package (all versions).
//      The req.params will contain the name of the package
//          - Can access by req.params.name
//          - Of type PackageName schema
//      Responses as follows:
//          - default: unexpected error
//              - Return type of Error schema
//          - 200: Return the package history.
//              - Return array of type PackageHistoryEntry schema
//          - 400: There is missing field(s) in the PackageName/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid.
//          - 404: No such package.
package_router.get('/byName/:name', async(req,res) => {
    
})

// Per spec, this DELETE: Delete all versions of this package.
//      The req.params will contain the name of the package
//          - Can access by req.params.name
//          - Of type PackageName schema
//      Responses as follows:
//          - 200: Package is deleted.
//          - 400: There is missing field(s) in the PackageName/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid.
//          - 404: Package does not exist.
package_router.delete('/byName/:name', async(req,res) => {

})

// Per spec, this POST: Get any packages fitting the regular expression. Search for a package using regular expression over package name 
//                      and READMEs. This is similar to search by name.
//      The req.body will contain PackageRegEx schema
//      Responses as follows:
//          - 200: Return a list of packages.
//              - Return array of type PackageMetaData schema
//          - 400: There is missing field(s) in the PackageRegEx/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid.
//          - 404: No package found under this regex.
package_router.post('/byRegEx', async(req,res) => {

})

// If functions are needed, name them according to operationId in spec
// If functions needed for:
//      - Creating package
//          Name it: PackageCreate
//      - Retrieving Package
//          Name it: PackageRetrieve
//      - Updating package
//          Name it: PackageUpdate
//      - Deleting package
//          Name it: PackageDelete
//      - Rating Package
//          Name it: PackageRate
//      - Getting package by name
//          Name it: PackageByNameGet
//      - Deleting package by name
//          Name it: PackageByNameDelete
//      - Getting package by RegEx
//          Name it: PackageByRegExGet
// Replace these comments related to the function with comment describing function


// Export the router as a module so other files can use it
module.exports = package_router