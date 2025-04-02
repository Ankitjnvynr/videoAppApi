
import express from 'express'

import cors from "cors"
import cookieParser from 'cookie-parser';


const app = express();

app.use(cors({
    origin:process.env.CORS_ORIGIN,
    credentials:true
}))

app.use(express.json({limit:"16kb"}))
app.use(express.urlencoded({extended:true,limit:'16kb'}))
app.use(express.static("public"))

app.use(cookieParser())



app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.get('/api/user', (req, res) => {
    res.json({
        code:200,
        data:[
            {
                _id:"123456",
                name:'Ankit',
                course:'BCA',
                email:'ankitbkana@outlook.com',
                phone:1234567899990
            },
            {
                _id:"123456",
                name:'Bhuvan',
                course:'MCA',
                email:'bhuvan@outlook.com',
                phone:3456788765446
            },
            {
                _id:"123456",
                name:'caption',
                course:'MBA',
                email:'caption@outlook.com',
                phone:9876543333333
            },
        ]
    })
})

export {cors,app}


