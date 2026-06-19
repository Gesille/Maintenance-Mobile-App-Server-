 //for error in the code 
class ErrorHandler extends Error{
    statusCode:Number;
    constructor(message:any, statusCode:Number){
        super(message);
        this.statusCode = statusCode;
        Error.captureStackTrace(this,this.constructor);
 console.error("━━━ 🟡 ErrorHandler ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("Status  :", statusCode);
    console.error("Message :", message);
    console.error("Stack   :", this.stack);  // ←
    }
}
export default ErrorHandler;