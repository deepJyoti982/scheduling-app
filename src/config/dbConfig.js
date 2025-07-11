const mongoose = require('mongoose');


module.exports = async function connectDB() {
    try {
        const connect = await mongoose.connect(process.env.MONGODB_URI)
        console.log("MongoDB is connected.", [connect.connection.host], [connect.connection.name])
    } catch (error) {
        console.log(error);
        process.exit(1);
    }
}