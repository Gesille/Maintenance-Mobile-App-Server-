import { Request } from "express";
import { IUser } from "../application/models/user.model";

declare global{
    namespace Express{
        interface Request{
            user?: IUser
        }
    }
}