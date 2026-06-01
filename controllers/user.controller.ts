import { Request, Response, NextFunction } from "express";

import jwt, { JwtPayload, Secret } from "jsonwebtoken";
import { CatchAsyncError } from "../middleware/catchAsyncError.js";
import ErrorHandler from "../utils/ErrorHandler.js";
import userModel, { IUser } from "../models/user.model.js";
import sendMail from "../utils/sendMail.js";
import { odooRequest } from "../odoo/odoo.client.js";




interface IActivationToken {
  token: string;
  activationCode: string;
}

export const createActivationToken = (user: any): IActivationToken => {
  const activationCode = Math.floor(1000 + Math.random() * 9000).toString();

  const token = jwt.sign(
    {
      user,
      activationCode,
    },
    process.env.ACTIVATION_SECRET as Secret,
    {
      expiresIn: "5m",
    },
  );
  return { token, activationCode };
}; 



//register user
interface IRegistrationBody {
  name: string;
  email: string;
  password: string;
  avatar?: string;
  role: string;
}

// Register user controller
export const registrationUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, password, role = "user" } = req.body;
      if (!name || !email || !password) {
        return next(new ErrorHandler("All fields are required", 400));
      }

      const isEmailExist = await userModel.findOne({ email });
      if (isEmailExist) {
        return next(new ErrorHandler("Email is already exist", 400));
      }
      const user: IRegistrationBody = {
        name,
        email,
        password,
        role,
      };
      const activationToken = createActivationToken(user);
      const activationCode = activationToken.activationCode;
      const data = { user: { name: user.name }, activationCode };

      try {
        await sendMail({
          email: user.email,
          subject: "Activate your account.",
          template: "activation-mail.ejs",
          data,
        });
        res.status(201).json({
          success: true,
          message: `Please check your email:${user.email} to activate your account `,
          activationToken: activationToken.token,
        });
      } catch (error: any) {
        return next(new ErrorHandler(error.message, 400));
      }
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  },
);


// activate user account
interface IActivationRequest {
  activation_token: string;
  activation_code: string;
}
export const activateUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { activation_code, activation_token } =
        req.body as IActivationRequest;

      if (!activation_token || !activation_code) {
        return next(
          new ErrorHandler("Activation token and code are required", 400),
        );
      }

      const newUser: {
        user: IUser;
        activationCode: string;
      } = jwt.verify(
        activation_token,
        process.env.ACTIVATION_SECRET as string,
      ) as { user: IUser; activationCode: string };

      if (newUser.activationCode !== activation_code) {
        return next(new ErrorHandler("Invalid activation code", 400));
      }

      const { name, email, password } = newUser.user;

      const existUser = await userModel.findOne({ email });
      if (existUser) {
        return next(new ErrorHandler("Email is already exist", 400));
      }

      //  create user first
      const user = await userModel.create({
        name,
        email,
        password,
      });

      let partnerId: number;

      try {
        //create partner in Odoo
        partnerId = await odooRequest("res.partner", "create", [
          {
            name: user.name,
            email: user.email,
          },
        ]);
      } catch (err) {
        console.error("❌ Odoo error:", err);

        // 🔥 IMPORTANT: rollback user
        await user.deleteOne();

        return next(new ErrorHandler("Failed to sync with Odoo", 500));
      }

      // save partner id
      user.odooPartnerId = Number(partnerId);
      await user.save();

      res.status(201).json({
        success: true,
        message: "User activated and synced with Odoo",
      });
    } catch (error: any) {
      console.error("Activation Error:", error);
      return next(
        new ErrorHandler(error.message || "Something went wrong", 400),
      );
    }
  },
);
