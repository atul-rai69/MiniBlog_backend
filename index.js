const express = require('express');
require('dotenv').config();
const cors = require('cors');
const User= require('./models/User');
const bcrypt= require('bcryptjs');
const mongoose= require('mongoose');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const Post = require('./models/Post');
const app= express();
const multer  = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('./cloudinaryConfig');
const fs = require('fs');

const salt = bcrypt.genSaltSync(10);
const secret = process.env.JWT_SECRET;

// Set up Cloudinary storage
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'uploads', // Folder name in Cloudinary
        allowed_formats: ['jpg', 'jpeg', 'png'], // Allowed file formats
    },
});
const upload = multer({ storage:storage });



app.use(cors({
    credentials:true,
    origin:process.env.CLIENT_URL,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    }));

app.use(express.json()); 
app.use(cookieParser());

mongoose.connect(process.env.MONGO_URL)
.then(() => console.log("connected to database successfully"))
.catch((err) => console.log(err));

app.post('/register' , async (req,res)=>{
    const {username,password}= req.body;
    try{
        const UserDoc = await User.create({
            username,
            password: bcrypt.hashSync(password,salt) ,
        });
        jwt.sign({ username, id: UserDoc._id }, secret, {}, (err, token) => {
            if (err) throw err;

            res.cookie('token', token, { httpOnly: true }).json({
                id: UserDoc._id,
                username,
            });
        });
           // res.json(UserDoc);
    }catch(e){
        res.status(400).json(e);
    }
    
});

app.post('/login',async (req,res) => {
    const {username , password}= req.body;
    const UserDoc = await User.findOne({username});
    const passOk = bcrypt.compareSync(password , UserDoc.password);
    if(passOk){
        jwt.sign({username, id:UserDoc._id},secret, {},(err, token) => {
            if(err) throw err;
            res.cookie('token',token).json({
                id:UserDoc._id,
                username,
            });
        })
    }else{
        res.status(400).json('wrong credentials');
    }
})

app.get('/profile',(req , res) => {
    const {token} = req.cookies;
    jwt.verify(token, secret, {}, (err,info) =>{
        if(err) throw err;
        res.json(info);
    });
});

app.post('/logout',(req,res) => {
    res.cookie('token', '').json('ok');
})

app.post('/post',upload.single('file'),async (req,res) => {
    try{
        if (!req.file) {
            return res.status(400).json({ error: 'File upload failed' });
        }
        console.log(req.file.path);
        const {token} = req.cookies;
    
        jwt.verify(token, secret, {},async (err,info) =>{
        if(err) throw err;
        const{title,summary,content} = req.body;
        // Cloudinary URL will be available in req.file.path after successful upload
        // Cloudinary URL
        const postDoc = await Post.create({
        title,
        summary,
        content,
        cover:req.file.path,
        author:info.id,
        });
        res.json(postDoc);
        });
    }
    catch (e) {
        console.error('Error in POST /post:', e);
        res.status(500).json('Internal server error');
    } 

    
});

app.put('/post',upload.single('file'), async (req,res) => {
    let newPath = null;
    if(req.file){
        const {originalname, path}= req.file;
        const parts = originalname.split('.');
        const ext = parts[parts.length -1];
        newPath = path+'.'+ext;
        fs.renameSync(path, newPath);
    }

    const {token} = req.cookies; 
    jwt.verify(token, secret, {},async (err,info) =>{
        if(err) throw err;
        const{id,title,summary,content} = req.body;
        const postDoc = await Post.findById(id);
        const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);
        if(!isAuthor){
            return res.status(400).json('you are not the author');
        }
        await postDoc.updateOne({
            title,
            summary,
            content,
            cover:newPath ? newPath : postDoc.cover,
        });
        res.json(postDoc);
    });

})

app.get('/post' ,async (req,res) => {
    res.json(
        await Post.find()
        .populate('author',['username'])
        .sort({createdAt: -1})
        .limit(20)
    );
})

app.get('/post/:id', async (req,res) =>{
    const {id} = req.params;
    const postDoc = await Post.findById(id).populate('author',['username']);
    res.json(postDoc);
})

const port = process.env.PORT || 4000;
app.listen(port);

