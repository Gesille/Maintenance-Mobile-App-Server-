import express from "express";
import { activateUser, deleteUser, getAllUsers, getUserInfo, loginUser, logoutUser, refreshTokenMiddleware, registrationUser, socialAuth, updateAccessToken, updatePassword, updateProfilePicture, updateUserInfo, updateUserRole } from "../controllers/user.controller.js";
import { authorizeRoles, isAuthenticated } from "../middleware/auth.js";

const userRouter = express.Router();

userRouter.post('/registration' , registrationUser);

userRouter.post('/activation',activateUser);

userRouter.post('/login',loginUser);

userRouter.get('/logout',isAuthenticated,logoutUser);

userRouter.get('/refresh-token',refreshTokenMiddleware,updateAccessToken);

userRouter.get('/get-user-info',refreshTokenMiddleware,isAuthenticated,getUserInfo);

userRouter.put('/update-user-info',refreshTokenMiddleware,isAuthenticated,updateUserInfo);

userRouter.post('/social-auth',socialAuth);

userRouter.put('/update-user-pass',refreshTokenMiddleware,isAuthenticated,updatePassword);

userRouter.put('/update-user-avatar',refreshTokenMiddleware,isAuthenticated,updateProfilePicture);

userRouter.get('/get-users',refreshTokenMiddleware,isAuthenticated,authorizeRoles("manager"),getAllUsers);

userRouter.put('/update-user',isAuthenticated,authorizeRoles("manager"),updateUserRole);

userRouter.delete('/delete-user/:id',refreshTokenMiddleware,isAuthenticated,authorizeRoles("admin"),deleteUser);

export default userRouter;