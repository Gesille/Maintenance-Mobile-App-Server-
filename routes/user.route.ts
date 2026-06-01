import express from "express";
import { activateUser, registrationUser } from "../controllers/user.controller.js";

const userRouter = express.Router();

userRouter.post('/registration' , registrationUser);

userRouter.post('/activation',activateUser);

export default userRouter;