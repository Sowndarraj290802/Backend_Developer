const express=require('express');
const app=express();
const axios=require('axios');
app.use(express.json());
const mongoose=require('mongoose');
const cors=require('cors');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const nodemailer=require('nodemailer');
app.use(cors());
const SECRET_KEY="2919";
const API_KEY="c2b1dadcc33f40719204fc9248111fdb";
const EMAIL_USER="sowndarraj272@gmail.com";
const EMAIL_PASS="ymvbmqeydwfzlelw";

mongoose.connect("mongodb://localhost:27017/login_users",{
    useNewUrlParser:true,
    useUnifiedTopology: true,
})
.then(()=>console.log("MongoDB Connected"))
.catch((err)=>console.log("MongoDB Connection Error",err))

const userSchema=new mongoose.Schema({
    name:{type:String,required:true},
    email:{type:String,required:true,unique:true},
    password:{type:String},
    subscribedCategories:[{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }]
})
const User=mongoose.model("User",userSchema);

const categorySchema=new mongoose.Schema({
    name:{type:String},
})
const Category=mongoose.model("Category",categorySchema);

const authenticate=(req,res,next)=>{
    const token=req.header("Authorization");
    if(!token){
        return res.status(404).json({message:"Unauthorized"})
    }
    try{
        const decoded=jwt.verify(token.replace("Bearer ",""),SECRET_KEY);
        req.userId=decoded.userId;
        next();
    }
    catch{
        res.status(404).json({error:"Invalid token"});
    }
}

app.post('/api/register',async(req,res)=>{
    const{name,email,password}=req.body;
    const hashedpassword=await bcrypt.hash(password,10);
    try{
        const user=new User({name,email,password:hashedpassword,subscribedCategories:[]});
        await user.save();
        res.status(201).json({message:"User registered succesfully",
            user:{
                id:user._id,
                name:user.name,
                email:user.email
            }
        });
    }
    catch(error){
        res.status(404).json({message:"Error",error})
    }
})

app.post('/api/login',async(req,res)=>{
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not Found" });
        }
        const ismatch = await bcrypt.compare(password, user.password);
        if (!ismatch) {
            return res.status(404).json({ message: "Invalid credentials" })
        }
        const token=jwt.sign({userId:user._id},SECRET_KEY,{expiresIn:"1h"});
        return res.json({
            message:"Login Successful",
            token,
            user:{
                id:user._id,
                name:user.name,
                email:user.email,
            }
        });
    }
    catch(err){
        return res.status(404).json({message:"Server error",err})
    }
})

const sendEmail=async(to,subject,text)=>{
    let transporter= nodemailer.createTransport({
        service:"gmail",
        auth:{
            user:EMAIL_USER,
            pass:EMAIL_PASS
        }
    });
    let info=await transporter.sendMail({
        from:`"My App" <${EMAIL_USER}>`,to,subject,text
    });
}

app.post('/api/subscribe',authenticate,async(req,res)=>{
    try{
    const{categories}=req.body;
    const user=await User.findById(req.userId);
    if(!user){
        return res.status(404).json({error:"User not Found"});
    }
    const categoryDocs= await Category.find({name:{$in:categories}});
    if(categoryDocs.length===0){
        return res.status(400).json({error:"No valid categories found to subscribe"});
    }
    user.subscribedCategories=categoryDocs.map(cat=>cat._id);
    await user.save();
    await sendEmail(user.email,"Subscription Confirmation",`You subscribed to ${categories.join(",")}`)
    res.json({message:"Subscribed Succesfully",subscribedCategories:categoryDocs.map(cat=>cat.name)});
    }
    catch(error){
        res.status(500).json({ error: "Failed to update subscriptions" });
    }
});

app.post('/api/unsubscribe',authenticate,async(req,res)=>{
    const {categories}=req.body;
    const user=await User.findById(req.userId);
    if(!user){
        return res.status(404).json({error:"User not Found"});
    }
    user.subscribedCategories=user.subscribedCategories.filter(cat=>!categories.includes(cat.toString()));
    await user.save();
    return res.status(200).json({message:"Unsubscribed Successfully"});
})

app.get('/api/personalized',authenticate,async(req,res)=>{
    try{
        const user=await User.findById(req.userId).populate("subscribedCategories");
        if(!user){
            return res.status(404).json({message:"User not found"});
        }
        
        if(user.subscribedCategories.length===0){
            return res.status(400).json({message:"No subscribed categories found"});
        }
        const categories=user.subscribedCategories.map(c=>c.name);
        let allArticles=[];
        for(let category of categories){
            try{
                const response=await axios.get(`https://newsapi.org/v2/top-headlines?category=${category}&apikey=${API_KEY}`);
                allArticles=allArticles.concat(response.data.articles);
            }
            catch(error){
                return res.status(404).json({error:"error in request"});
            }
        }
        return res.json({ message: "Personalized News Fetched", articles:allArticles });
    }
    catch(error){
        return res.status(500).json({error:"Internal Server Error"});
    }
})

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>{
    console.log(`Server running on http://localhost:${PORT} `);
})