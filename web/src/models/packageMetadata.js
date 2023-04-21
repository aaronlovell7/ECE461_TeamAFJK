const mongoose = require('mongoose')
const packageName = require('./packageName')
const packageID = require('./packageID')

const packageMetadataSchema = new mongoose.Schema({
    Name: {
        type: String,
        description: 'Package Name',
        example: 'my-package',
        required: true
    },
    Version: {
        description: 'Package Version',
        type: String,
        example: '1.2.3',
        required: true
    }
})

module.exports = mongoose.model('PackageMetadata', packageMetadataSchema)
