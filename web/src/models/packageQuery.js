const mongoose = require('mongoose')

const packageQuerySchema = new mongoose.Schema({
    Version: {
        type: String,
        description: "",
        example: "Exact (1.2.3)\
                \ Bounded range (1.2.3-2.1.0)\
                \ Carat (^1.2.3)\
                \ Tilde (~1.2.0)"
    },
    Name: {
        type: String,
        description: "",
        required: true
    }
})

module.exports = mongoose.model('PackageQuery', packageQuerySchema)