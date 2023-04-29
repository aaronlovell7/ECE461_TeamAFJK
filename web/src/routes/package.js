// Here we are importing the Express library and creating an instance of a Router object from it
// Router objects are used to define the routing for the applications HTTP requests 
const express = require('express')
const package_router = express.Router()

// Here we are importing the node-zip library to use for extracting data from zip files
const JSZip = require('jszip')

// Allow for requests through CORS
package_router.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT,DELETE");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

// Here we are importing the needed models for this endpoint
// Models represent collections in the database. They define the structure of the documents in the collection and provide an 
//      interface for querying, saving, updating, and deleting documents within the database error
const PackageData = require('../models/packageData')
const Package = require('../models/package')
const PackageRating = require('../models/packageRating')
const PackageRegEx = require('../models/packageRegEx')
const PackageMetadata = require('../models/packageMetadata')
const User = require('../models/user')
const PackageHistoryEntry = require('../models/packageHistoryEntry')

// Import child process library. Used for calling our rating script
const util = require('node:util')
const execFile = util.promisify(require('node:child_process').execFile);
const { spawn } = require('child_process')

// For writing to file for JSProgram
const fs = require('fs')

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
        res.locals.data = {message: 'There is missing field(s) in the PackageData/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid.'}
        res.status(400).json(res.locals.data)
    }

    if(isValid) {
        // Our own validation to find out what we are doing (Upload or ingestion)
        if((!!newPackageDataSchema.Content) ^ (!!newPackageDataSchema.URL)) {
            if(newPackageDataSchema.Content) { // zip file upload
                // Check if package exists already
                if(await PackageData.findOne({ Content: newPackageDataSchema.Content })) {
                    res.locals.data = { message: 'Package exists already.' }
                    res.status(409).json(res.locals.data)
                }
                else {
                    // Get name and version from package.json
                    const base64Content = newPackageDataSchema.Content
                    let newName
                    let newVersion
                    let newURL
                    let zipError = false
                    let isName = true
                    let packageJSON
                    try {
                        // Decode content, extract package.json, then extract name and version from it
                        const decodedContent = Buffer.from(base64Content, 'base64')
                        const zip = await JSZip.loadAsync(decodedContent)

                        // Look through all directories and files for a package.json
                        async function findPackageJSON(zip) {
                            zip.forEach((relativePath, zipEntry) => {
                                if (zipEntry.name.includes('package.json')) {
                                  packageJSON = zipEntry.async('string');
                                  return false // breaks when it finds it
                                }
                              });
                              return packageJSON
                        }
                        packageJSON = await findPackageJSON(zip)
                        
                        newName = JSON.parse(packageJSON).name
                        if(!newName) isName = false
                        newVersion = JSON.parse(packageJSON).version
                        if(!newVersion) newVersion = "1.0.0"
                        newURL = JSON.parse(packageJSON).homepage
                    }
                    catch {
                        // Per piazza post 196
                        zipError = true;
                        res.locals.data = { message: 'No package.json in module.' }
                        res.status(400).json(res.locals.data)
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
                            newPackageMetadataSchema.Name = newPackageMetadataSchema._id
                        }

                        await newPackageMetadataSchema.save()

                        // Create package schema
                        const newPackageSchema = new Package ({
                            metadata: newPackageMetadataSchema._id,
                            data: newPackageDataSchema._id
                        })

                        let newPackage = await newPackageSchema.save()

                        // Create history entry for this upload if its a sensitive module
                        if(!!newPackageDataSchema.JSProgram) {
                            const defaultUser = await User.findOne({ name: "ece30861defaultadminuser" }).exec()

                            const newPackageHistoryEntry = new PackageHistoryEntry ({
                                User: defaultUser._id,
                                Date: Date.now(),
                                PackageMetaData: newPackageMetadataSchema._id,
                                Action: 'CREATE'
                            })

                            await newPackageHistoryEntry.save()
                        }

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
                    res.locals.data = { message: 'There is missing fields in PackageData or the URL is formed improperly.' }
                    res.status(400).json(res.locals.data)
                }
                // check if a package with that URL already exists
                else if(await PackageData.findOne({ URL: newPackageDataSchema.URL })) {
                    res.locals.data = { message: 'Package exists already.' }
                    res.status(409).json(res.locals.data)
                }
                else{
                    // call the child process using the URL
                    // let rating_output = ""
                    // async function callRatingCLI()
                    // {
                    //     const { stdout } = await execFile('./461_CLI/route_run', [newPackageDataSchema.URL]);
                    //     rating_output = JSON.parse(stdout)
                    // }
                    // await callRatingCLI()
                    
                    // // check if all ratings are above 0.5
                    // if(rating_output['BUS_FACTOR_SCORE'] < 0.5 || rating_output['CORRECTNESS_SCORE'] < 0.5 
                    //     || rating_output['CORRECTNESS_SCORE'] < 0.5 || rating_output['RAMP_UP_SCORE'] < 0.5 
                    //     || rating_output['RESPONSIVE_MAINTAINER_SCORE'] < 0.5 || rating_output['LICENSE_SCORE'] < 0.5
                    //     || rating_output['VERSION_SCORE'] < 0.5 || rating_output['CODE_REVIEWED_PERCENTAGE'] < 0.5 )
                    // {
                    //     res.status(424).json({ message: "Package not uploaded due to disqualified rating" })
                    // }
                    // else
                    // {
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
                            res.locals.data = { message: 'No package.json in module.' }
                            res.status(400).json(res.locals.data)
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
                            if(!!newPackageDataSchema.JSProgram) {
                                const defaultUser = await User.findOne({ name: "ece30861defaultadminuser" }).exec()
    
                                const newPackageHistoryEntry = new PackageHistoryEntry ({
                                    User: defaultUser._id,
                                    Date: Date.now(),
                                    PackageMetaData: newPackageMetadataSchema._id,
                                    Action: 'CREATE'
                                })
    
                                await newPackageHistoryEntry.save()
                            }

                            newPackage = await Package.findById(newPackage._id).populate('data').populate('metadata')
    
                            res.status(201).json(newPackage)
                        }
                    // }
                }
            }
        }
        else {
            res.locals.data = { message: 'There is missing field(s) in the PackageData/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid.' }
            res.status(400).json(res.locals.data)
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
                res.locals.data = { message: "Package does not exist." }
                res.status(404).json(res.locals.data)
                doesExist = false
            }
            else {
                curPackage = await Package.findOne({ metadata: curPackageMetadata._id })
                curPackageData = await PackageData.findById(curPackage.data)
            }
        } catch (err){
            res.locals.data = { message: "Unknown error in finding packages." }
            res.status(500).json(res.locals.data)
            doesExist = false
        }

        if(doesExist) {
            let isValid = true
            try {
                await curPackageData.validate()
            }
            catch (err) {
                isValid = false
                res.locals.data = { message: "in does exist. There is missing field(s) in the PackageID or it is formed improperly." }
                res.status(400).json( res.locals.data)
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

                // If sensitive module, must run JSProgram to check if it can be downloaded
                if(!!curPackageData.JSProgram) {
                    // Create .js file for JSProgram
                    fs.writeFile("download_test.js", curPackageData.JSProgram, (err) => {
                        if(err) {
                            console.error(err)
                            res.locals.data = { message: "Unknown error in writing JSProgram." }
                            res.status(500).json(res.locals.data)
                            return
                        }
                    })

                    // Create child process
                    // Spawn a new process and run the command
                    async function callScript() {
                        return new Promise ((resolve, reject) => {
                            const args = ['download_test.js', curPackageMetadata.Name, curPackageMetadata.Version, "ece30861defaultadminuser", "ece30861defaultadminuser", "zip_file_path"]
                            const child = spawn('node', args)

                            child.on('exit', (code) => {
                                if (code === 0) {
                                    resolve(0)
                                } else {
                                    resolve(1)
                                }
                            });
                        })
                    }

                    const output = await callScript()

                    if(output === 0) {
                        // Create history entry for this download 
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
                    else {
                        res.locals.data = { message: "Download of sensitive module rejected." }
                        res.status(424).json( res.locals.data)
                    }
                }
                else {
                    res.status(200).json({ metadata: returnMetadata, data: returnData})
                }
            }
        }
    }
    else {
        res.locals.data = { message: 'There is missing field(s) in the PackageID or it is formed improperly.' }
        res.status(400).json(res.locals.data)
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
                res.locals.data = { message: "Package does not exist." }
                res.status(404).json(res.locals.data)
                doesExist = false
            }
            else {
                curPackage = await Package.findOne({ metadata: curPackageMetadata._id })
                curPackageData = await PackageData.findById(curPackage.data)
            }
        } catch {
            res.locals.data = { message: "Unknown error." }
            res.status(500).json(res.locals.data)
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
                res.locals.data = { message: "in does exist. There is missing field(s) in the PackageID/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid." }
                res.status(400).json(res.locals.data)
            }

            if(isValid) {

                if (req.body.metadata.Name == curPackageMetadata.Name && req.body.metadata.Version == curPackageMetadata.Version) {
                    // Need to make sure that ID matches as well, not sure how to do this with our current set up

                    // Update data in old package with new one
                    const updatedData = await PackageData.findByIdAndUpdate( 
                        { _id: curPackage.data }, 
                        { Content: newPackageDataSchema.Content })

                    // Create history entry for this update
                    if(!!curPackageData.JSProgram) {
                        const defaultUser = await User.findOne({ name: "ece30861defaultadminuser" }).exec()

                        const newPackageHistoryEntry = new PackageHistoryEntry ({
                            User: defaultUser._id,
                            Date: Date.now(),
                            PackageMetaData: curPackageMetadata._id,
                            Action: 'UPDATE'
                        })

                        await newPackageHistoryEntry.save()
                    }
                    
                    res.status(200).json({ message: "Version is updated." })
                }
            }
        }
    }
    else {
        res.locals.data = { message: "There is missing field(s) in the PackageID/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid." }
        res.status(400).json( res.locals.data)
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
                res.locals.data = { message: "Package does not exist." }
                res.status(404).json(res.locals.data)
                doesExist = false
            }
            else {
                curPackage = await Package.findOne({ metadata: curPackageMetadata._id })
                curPackageData = await PackageData.findById(curPackage.data)
            }
        } catch {
            res.locals.data = { message: "Unknown error." }
            res.status(500).json(res.locals.data)
            doesExist = false
        }

        if(doesExist) {
            let isValid = true
            try {
                await curPackage.validate()
            }
            catch (err) {
                isValid = false
                res.locals.data = { message: " in does exists. There is missing field(s) in the PackageID/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid." }
                res.status(400).json(res.locals.data)
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
        res.locals.data = { message: "There is missing field(s) in the PackageID/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid." }
        res.status(400).json(res.locals.data)
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
    // This validates that the req.body is a valid PackageID/ObjectID type
    let isValid = true
    
    if(isValidObjectId(req.params.id))
    {
        // use find by id to find a Data schema with PackageID. 404 if it doesn't 
        const curPackageMetadata = await PackageMetadata.findById({ _id: req.params.id})   
        // Need to be able to go from input: PackageID --> Data --> URL --> Package = output
        let curPackage
        let curPackageData
        let url_elements
        if( curPackageMetadata == null )
        {
            res.locals.data = { message: 'Package does not exist' }
            res.status(404).json( res.locals.data)
            isValid = false
        }
        else
        {
            curPackage = await Package.findOne({ metadata: curPackageMetadata._id })
            curPackageData = await PackageData.findById( curPackage.data )
            url_elements = newPackageDataSchema.URL.split('/') 
        }

        if( isValid && (url_elements.includes('github.com') || url_elements.includes('www.npmjs.com')) )
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

                // Create history entry for this upload
                if(!!curPackageData.JSProgram) {
                    const defaultUser = await User.findOne({ name: "ece30861defaultadminuser" }).exec()

                    const newPackageHistoryEntry = new PackageHistoryEntry ({
                        User: defaultUser._id,
                        Date: Date.now(),
                        PackageMetaData: curPackageMetadata._id,
                        Action: 'RATE'
                    })

                    await newPackageHistoryEntry.save()
                }

                res.status(200).json(newPackageRatingSchema)
            } catch (err) {
                // return 500 status code if calling the rating CLI resulted in any error
                console.error(err)
                res.locals.data = { message: 'The package rating system choked on one of the metrics' }
                res.status(500).json(res.locals.data)
            }
        }
        else
        {
            res.status(400).json({ message: 'There is missing field(s) in the PackageID or it is formed improperly - invalid URL'})
        }
    }
    else
    {
        res.locals.data = { message: 'There is missing field(s) in the PackageID or it is formed improperly'}
        res.status(400).json(res.locals.data)
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
        res.locals.data = { message: 'No such package.' }
        res.status(404).json(res.locals.data)
    }
    else {
        let isValid = true
        
        // Validate package
        try {
            await md.validate()
        } catch {
            isValid = false
            res.locals.data = { message: 'There is missing field(s) in the PackageName or it is formed improperly.' }
            res.status(400).json(res.locals.data)
        }
        if (isValid){
            let output_array = []

            // Create array of packages matching name
            try {
                output_array = await PackageHistoryEntry.find({ PackageMetaData: md._id }).populate('User').populate('PackageMetaData').exec()
                res.status(200).json(output_array)
            } catch {
                res.locals.data = { message: 'Unexpected error.' }
                res.status(500).json(res.locals.data)
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
        res.locals.data = { message: 'No such package.' }
        res.status(404).json(res.locals.data)
    }
    else {
        let isValid = true

        // Validate
        try {
            await md.validate()
        } catch {
            isValid = false
            res.locals.data = { message: 'There is missing field(s) in the PackageName or it is formed improperly.' }
            res.status(400).json(res.locals.data)
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
        res.locals.data = { message: 'Unknown error.' }
        res.status(500).json(res.locals.data)
    }

    // Check if nothing was found
    if(output_array.length == 0) {
        res.locals.data = { message: 'No package found under this regex.' }
        res.status(404).json(res.locals.data)
    }
    else {
        res.status(200).json(output_array)
    }
})

// Export the router as a module so other files can use it
module.exports = package_router