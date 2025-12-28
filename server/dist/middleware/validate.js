import { z } from 'zod';
// Generic validation middleware for request body
export const validate = (schema) => {
    return async (req, res, next) => {
        try {
            const result = await schema.parseAsync(req.body);
            req.body = result;
            next();
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Validation failed',
                    details: error.issues.map((issue) => ({
                        field: issue.path.join('.'),
                        message: issue.message,
                    })),
                });
                return;
            }
            next(error);
        }
    };
};
// Validate query parameters - returns parsed data but doesn't reassign req.query
export const validateQuery = (schema) => {
    return async (req, res, next) => {
        try {
            const result = await schema.parseAsync(req.query);
            // Store parsed result on request for use in handlers
            req.validatedQuery = result;
            next();
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid query parameters',
                    details: error.issues.map((issue) => ({
                        field: issue.path.join('.'),
                        message: issue.message,
                    })),
                });
                return;
            }
            next(error);
        }
    };
};
// Validate URL parameters - returns parsed data but doesn't reassign req.params
export const validateParams = (schema) => {
    return async (req, res, next) => {
        try {
            const result = await schema.parseAsync(req.params);
            // Store parsed result on request for use in handlers
            req.validatedParams = result;
            next();
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid URL parameters',
                    details: error.issues.map((issue) => ({
                        field: issue.path.join('.'),
                        message: issue.message,
                    })),
                });
                return;
            }
            next(error);
        }
    };
};
//# sourceMappingURL=validate.js.map