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
const PackageName = require('../models/packageName')
const PackageRegEx = require('../models/packageRegEx')
const PackageMetadata = require('../models/packageMetadata')
const User = require('../models/user')
const PackageHistoryEntry = require('../models/packageHistoryEntry')

// Import child process library. Used for calling our rating script
const util = require('node:util')
const execFile = util.promisify(require('node:child_process').execFile);

// for Github REST API calls to extract info about modules
const axios = require('axios')
const { isValidObjectId } = require('mongoose');

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
                    // Get name and version from package.json
                    const base64Content = newPackageDataSchema.Content
                    let newName
                    let newVersion
                    let newURL
                    let zipError = false
                    let isName = true
                    try {
                        // Decode content, extract package.json, then extract name and version from it
                        const decodedContent = Buffer.from(base64Content, 'base64')
                        const zip = await JSZip.loadAsync(decodedContent)
                        const packageJSON = await zip.file('package.json').async('string')
                        newName = JSON.parse(packageJSON).name
                        if(!newName) isName = false
                        newVersion = JSON.parse(packageJSON).version
                        if(!newVersion) newVersion = "1.0.0"
                        newURL = JSON.parse(packageJSON).homepage
                    }
                    catch {
                        // Per piazza post 196
                        zipError = true;
                        res.status(400).json({ message: 'No package.json in module.'})
                    }

                    if(!zipError) {
                        // Add URL for later use if needed
                        newPackageDataSchema.URL = newURL
                        await newPackageDataSchema.save()

                        // Create packageMetadata schema
                        const newPackageMetadataSchema = new PackageMetadata ({
                            Name: "default",
                            Version: newVersion,
                        })

                        await newPackageMetadataSchema.save()

                        // Set name accordingly 
                        if(isName) {
                            newPackageMetadataSchema.Name = newName
                        } 
                        else {
                            newPackageMetadataSchema.Name = _id
                        }

                        await newPackageMetadataSchema.save()

                        // Create package schema
                        const newPackageSchema = new Package ({
                            metadata: newPackageMetadataSchema._id,
                            data: newPackageDataSchema._id
                        })

                        let newPackage = await newPackageSchema.save()

                        // Create history entry for this upload
                        const defaultUser = await User.findOne({ name: "ece30861defaultadminuser" }).exec()

                        const newPackageHistoryEntry = new PackageHistoryEntry ({
                            User: defaultUser._id,
                            Date: Date.now(),
                            PackageMetaData: newPackageMetadataSchema._id,
                            Action: 'CREATE'
                        })

                        await newPackageHistoryEntry.save()

                        newPackage = await Package.findById(newPackage._id).populate('data').populate('metadata')

                        res.status(201).json(newPackage)
                    }
                }
            }
            else { // Ingestion: user provided a URL
                // check if the input is formatted correctly --> URL is either github or npm
                url_elements = newPackageDataSchema.URL.split('/')
                if( !(url_elements.includes('github.com') || url_elements.includes('www.npmjs.com')) )
                {
                    res.status(400).json({ message: 'There is missing fields in PackageData or the URL is formed improperly' })
                }
                // check if a package with that URL already exists
                else if(await PackageData.findOne({ URL: newPackageDataSchema.URL })) {
                    res.status(409).json({ message: 'Package exists already.' })
                }
                else{
                    // call the child process using the URL
                    let rating_output = ""
                    async function callRatingCLI()
                    {
                        const { stdout } = await execFile('./461_CLI/route_run', [newPackageDataSchema.URL]);
                        rating_output = JSON.parse(stdout)
                    }
                    await callRatingCLI()
                    
                    // check if all ratings are above 0.5
                    if(rating_output['BUS_FACTOR_SCORE'] < 0.5 || rating_output['CORRECTNESS_SCORE'] < 0.5 
                        || rating_output['CORRECTNESS_SCORE'] < 0.5 || rating_output['RAMP_UP_SCORE'] < 0.5 
                        || rating_output['RESPONSIVE_MAINTAINER_SCORE'] < 0.5 || rating_output['LICENSE_SCORE'] < 0.5
                        || rating_output['VERSION_SCORE'] < 0.5 || rating_output['CODE_REVIEWED_PERCENTAGE'] < 0.5 )
                    {
                        res.status(424).json({ message: "Package not uploaded due to disqualified rating" })
                    }
                    else
                    {
                        // setting owner/repo args for calls to API
                        let owner;
                        let repo;
                        if(url_elements.includes('github.com'))
                        {
                            owner = url_elements[3];
                            repo = url_elements[4];
                        }
                        else // for npm URLs
                        {
                            owner = url_elements[4];
                            const response = await axios.get(`https://registry.npmjs.org/${owner}`);
                            url_out = response.data.repository['url'];
                            url_parts = url_out.split("/");
                            owner = url_parts[3];
                            repo_withgit = url_parts[4];
                            repo_parts = repo_withgit.split(".git");
                            repo = repo_parts[0];
                        }

                        // Get the package.json using Github REST API and extract name and version from package.json
                        const base64Encoded = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contents/package.json`, {
                            headers: {
                                'Authorization': `Token ${process.env.GITHUB_TOKEN}`
                            }
                        });
                        let newName
                        let newVersion
                        let zipError = false
                        try {
                            // Decode content, extract package.json, then extract name and version from it
                            const packageJSON = Buffer.from(base64Encoded.data.content, 'base64').toString('utf8');
                            newName = JSON.parse(packageJSON).name
                            if(!newName) newName = `${owner}/${repo}`
                            newVersion = JSON.parse(packageJSON).version
                            if(!newVersion) newVersion = "1.0.0"
                        }
                        catch {
                            // Per piazza post 196
                            zipError = true;
                            res.status(400).json({ message: 'No package.json in module.'})
                        }

                        if(!zipError) {
                            // Add contents field to PackageData schema
                            const zipFile = await axios.get(`https://api.github.com/repos/${owner}/${repo}/zipball/master`, {
                                headers: {
                                    'Authorization': `Token ${process.env.GITHUB_TOKEN}`
                                }
                            })
                            newPackageDataSchema.Content = Buffer.from(zipFile.data, 'base64');

                            await newPackageDataSchema.save()
    
                            // Create PackageMetadata schema
                            const newPackageMetadataSchema = new PackageMetadata ({
                                Name: newName,
                                Version: newVersion,
                            })

                            await newPackageMetadataSchema.save()
    
                            // Create package schema
                            const newPackageSchema = new Package ({
                                metadata: newPackageMetadataSchema._id,
                                data: newPackageDataSchema._id
                            })
    
                            let newPackage = await newPackageSchema.save()

                            // Create history entry for this upload
                            const defaultUser = await User.findOne({ name: "ece30861defaultadminuser" }).exec()

                            const newPackageHistoryEntry = new PackageHistoryEntry ({
                                User: defaultUser._id,
                                Date: Date.now(),
                                PackageMetaData: newPackageMetadataSchema._id,
                                Action: 'CREATE'
                            })

                            await newPackageHistoryEntry.save()

                            newPackage = await Package.findById(newPackage._id).populate('data').populate('metadata')
    
                            res.status(201).json(newPackage)
                        }
                    }
                }
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
    let doesExist = true
    let curPackageData
    let curPackageMetadata
    let curPackage 

    if(isValidObjectId(req.params.id)) {
        try {
            curPackageMetadata = await PackageMetadata.findById(req.params.id)

            if(curPackageMetadata == null) {
                res.status(404).json({ message: "Package does not exist." })
                doesExist = false
            }
            else {
                curPackage = await Package.findOne({ metadata: curPackageMetadata._id })
                curPackageData = await PackageData.findById(curPackage.data)
            }
        } catch (err){
            res.status(500).json({ message: "Unknown error." })
            doesExist = false
        }

        if(doesExist) {
            let isValid = true
            try {
                await curPackageData.validate()
            }
            catch (err) {
                isValid = false
                res.status(400).json({ message: "There is missing field(s) in the PackageID or it is formed improperly." })
            }

            if (isValid) {

                var returnMetadata = {
                    "Name": curPackageMetadata.Name,
                    "Version": curPackageMetadata.Version,
                }

                var returnData = {
                    "Content": curPackageData.Content,
                    "URL": curPackageData.URL,
                    "JSProgram": curPackageData.JSProgram
                }        

                // Create history entry for this upload
                const defaultUser = await User.findOne({ name: "ece30861defaultadminuser" }).exec()

                const newPackageHistoryEntry = new PackageHistoryEntry ({
                    User: defaultUser._id,
                    Date: Date.now(),
                    PackageMetaData: curPackageMetadata._id,
                    Action: 'DOWNLOAD'
                })

                await newPackageHistoryEntry.save()

                res.status(200).json({ metadata: returnMetadata, data: returnData})
            }
        }
    }
    else {
        res.status(400).json({ message: 'There is missing field(s) in the PackageID or it is formed improperly.' })
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
    let doesExist = true
    let curPackageData
    let curPackageMetadata 
    let curPackage 

    if(isValidObjectId(req.params.id)) {
        try {
            if((curPackageMetadata = await PackageMetadata.findById({ _id: req.params.id })) == null) {
                res.status(404).json({ message: "Package does not exist." })
                doesExist = false
            }
            else {
                curPackage = await Package.findOne({ metadata: curPackageMetadata._id })
                curPackageData = await PackageData.findById(curPackage.data)
            }
        } catch {
            res.status(500).json({ message: "Unknown error." })
            doesExist = false
        }

        if(doesExist) {
            const newPackageDataSchema = new PackageData(req.body.data)
            let isValid = true;
            try {
                await newPackageDataSchema.validate()
            }
            catch {
                isValid = false;
                res.status(400).json({ message: "There is missing field(s) in the PackageID/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid." })
            }

            if(isValid) {

                if (req.body.metadata.Name == curPackageMetadata.Name && req.body.metadata.Version == curPackageMetadata.Version) {
                    // Need to make sure that ID matches as well, not sure how to do this with our current set up

                    // Update data in old package with new one
                    const updatedData = await PackageData.findByIdAndUpdate( 
                        { _id: curPackage.data }, 
                        { Content: newPackageDataSchema.Content })

                    // Create history entry for this upload
                    const defaultUser = await User.findOne({ name: "ece30861defaultadminuser" }).exec()

                    const newPackageHistoryEntry = new PackageHistoryEntry ({
                        User: defaultUser._id,
                        Date: Date.now(),
                        PackageMetaData: curPackageMetadata._id,
                        Action: 'UPDATE'
                    })

                    await newPackageHistoryEntry.save()
                    
                    res.status(200).json({ message: "Version is updated." })
                }
            }
        }
    }
    else {
        res.status(400).json({ message: "There is missing field(s) in the PackageID/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid." })
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
    let doesExist = true
    let curPackageData
    let curPackageMetadata
    let curPackage 

    if(isValidObjectId(req.params.id)) {
        try {
            if((curPackageMetadata = await PackageMetadata.findById({ _id: req.params.id })) == null) {
                res.status(404).json({ message: "Package does not exist." })
                doesExist = false
            }
            else {
                curPackage = await Package.findOne({ metadata: curPackageMetadata._id })
                curPackageData = await PackageData.findById(curPackage.data)
            }
        } catch {
            res.status(500).json({ message: "Unknown error." })
            doesExist = false
        }

        if(doesExist) {
            let isValid = true
            try {
                await curPackage.validate()
            }
            catch (err) {
                isValid = false
                res.status(400).json({ message: "There is missing field(s) in the PackageID/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid." })
            }
            if (isValid) {
                await Promise.all([
                    Package.deleteMany(curPackage._id),
                    PackageData.deleteMany(curPackageData._id),
                    PackageMetadata.deleteMany(curPackageMetadata._id),
                ]);

                res.status(200).json({ message: "Package is deleted." })
            }
        }
    }
    else {
        res.status(400).json({ message: "There is missing field(s) in the PackageID/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid." })
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
    // This validates that the req.body conforms to the PackageID schema
    const newPackageIDSchema = new PackageID(req.body)
    let isValid = true
    try {
        await newPackageIDSchema.validate()
    }
    catch {
        isValid = false    
        // if the format of the input is not in PackageID, return a 400 code
        res.status(400).json({ message: 'There is missing field(s) in the PackageID or it is formed improperly'})
    }
    if(isValid)
    {
        // use find by id to find a Metadata schema with PackageID. 404 if it doesn't 
        const curPackage = await Package.findById({ _id: req.params.id})
        const curPackageData = await PackageData.findById( curPackage.data )    
        // Need to be able to go from input: PackageID --> Metadata --> Package = output
        if( curPackage == null )
        {
            res.status(404).json({ message: 'Package does not exist' })
        }
        // if it does exist, call the child to rate the module
        else
        {
            // call the child process using the URL
            let rating_output = ""
            async function callRatingCLI()
            {
                const { stdout } = await execFile('./461_CLI/route_run', [curPackageData.URL]);
                rating_output = JSON.parse(stdout)
            }
            try{ 
                await callRatingCLI()
            
                // create new PackageRating schema
                const newPackageRatingSchema = new PackageRating({
                    NetScore: rating_output['NET_SCORE'],
                    BusFactor: rating_output['BUS_FACTOR_SCORE'],
                    Correctness: rating_output['CORRECTNESS_SCORE'],
                    RampUp: rating_output['RAMP_UP_SCORE'],
                    ResponsiveMaintainer: rating_output['RESPONSIVE_MAINTAINER_SCORE'],
                    LicenseScore: rating_output['LICENSE_SCORE'],
                    GoodPinningPractice: rating_output['VERSION_SCORE'],
                    PullRequest: rating_output['CODE_REVIEWED_PERCENTAGE']
                })

                await newPackageRatingSchema.save()

                res.status(200).json(newPackageRatingSchema)
            } catch {
                // return 500 status code if calling the rating CLI resulted in any error
                res.status(500).json({ message: 'The package rating system choked on one of the metrics' })
            }
        }
    }
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
    let md;

    // Check package exists
    if(!(md = await PackageMetadata.findOne({ Name: req.params.name }))) {
        res.status(404).json({ message: 'No such package.' })
    }
    else {
        let isValid = true
        
        // Validate package
        try {
            await md.validate()
        } catch {
            isValid = false
            res.status(400).json({ message: 'There is missing field(s) in the PackageName or it is formed improperly.' })
        }
        if (isValid){
            let output_array = []

            // Create array of packages matching name
            try {
                output_array = await PackageHistoryEntry.find({ PackageMetaData: md._id }).exec()
                res.status(200).json(output_array)
            } catch {
                res.status(500).json({ message: 'Unexpected error.' })
            }
        }
    }
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
    let md

    // Find package 
    if(!(md = await PackageMetadata.findOne({ Name: req.params.name }))) {
        res.status(404).json({ message: 'No such package.' })
    }
    else {
        let isValid = true

        // Validate
        try {
            await md.validate()
        } catch {
            isValid = false
            res.status(400).json({ message: 'There is missing field(s) in the Name or it is formed improperly.' })
        }
        if (isValid){
            // Find Package and PackageData documents
            const package = await Package.findOne({ metadata: md._id })
            const data = await PackageData.findById({ _id: package.data })
            
            // Delete related packages
            await Promise.all([
                Package.deleteMany(package._id),
                PackageData.deleteMany(data._id),
                PackageHistoryEntry.deleteMany({ PackageMetadata: md._id }),
                PackageMetadata.deleteMany(md._id),
            ]);
            res.status(200).json({ message: 'Package is deleted.' })
        }
    }
})

package_router.get('/', async (req, res) => {
    try {
        const packages = await PackageName.find()
        res.json(packages)
    }
    catch (err) {
        res.status(500)
    }
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
    // Load reg ex into schema
    const newPackageRegEx = await new PackageRegEx(req.body)

    // Validate
    try {
        await newPackageRegEx.validate()
    } catch {
        res.status(400).json({ message: 'There is missing field(s) in the PackageRegEx or it is formed improperly.' })
    }

    // Search by reg ex
    let output_array = []
    try {
        output_array = await PackageMetadata.find({ Name: { $regex: newPackageRegEx.PackageRegEx } }).exec()
    } catch {
        res.status(500).json({ message: 'Unknown error.' })
    }

    // Check if nothing was found
    if(output_array.length == 0) {
        res.status(404).json({ message: 'No package found under this regex.' })
    }
    else {
        res.status(200).json(output_array)
    }
})

// Export the router as a module so other files can use it
module.exports = package_router