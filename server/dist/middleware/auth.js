import jwt from 'jsonwebtoken';
import { db, users } from '../db/index.js';
import { eq } from 'drizzle-orm';
export const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!token) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [user] = await db
            .select({ id: users.id, email: users.email, name: users.name })
            .from(users)
            .where(eq(users.id, decoded.userId))
            .limit(1);
        if (!user) {
            res.status(401).json({ error: 'User not found' });
            return;
        }
        req.user = user;
        next();
    }
    catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            res.status(401).json({ error: 'Invalid token' });
            return;
        }
        if (error instanceof jwt.TokenExpiredError) {
            res.status(401).json({ error: 'Token expired' });
            return;
        }
        next(error);
    }
};
export const generateTokens = (userId, email) => {
    // Add a unique jti (JWT ID) to ensure tokens are unique even when generated at the same second
    const jti = crypto.randomUUID();
    const accessToken = jwt.sign({ userId, email }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ userId, email, type: 'refresh', jti }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
};
export const verifyRefreshToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
};
//# sourceMappingURL=auth.js.map