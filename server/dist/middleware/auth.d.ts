import { Request, Response, NextFunction } from 'express';
export interface JWTPayload {
    userId: string;
    email: string;
}
export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        name: string;
    };
}
export declare const authenticate: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const generateTokens: (userId: string, email: string) => {
    accessToken: string;
    refreshToken: string;
};
export declare const verifyRefreshToken: (token: string) => JWTPayload & {
    type: string;
};
//# sourceMappingURL=auth.d.ts.map