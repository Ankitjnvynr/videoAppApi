
import express from 'express'


export const app = express();

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.get('/api/user', (req, res) => {
    res.json({
        code:200,
        data:"this is data"
    })
})


