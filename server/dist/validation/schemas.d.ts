import { z } from 'zod';
export declare const registerSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    interests: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export declare const refreshTokenSchema: z.ZodObject<{
    refreshToken: z.ZodString;
}, z.core.$strip>;
export declare const updateProfileSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    avatar: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    interests: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const createGroupSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    avatar: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export declare const updateGroupSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    avatar: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export declare const createSessionSchema: z.ZodObject<{
    groupId: z.ZodString;
    title: z.ZodString;
}, z.core.$strip>;
export declare const updateSessionSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        active: "active";
        archived: "archived";
    }>>;
}, z.core.$strip>;
export declare const sendMessageSchema: z.ZodObject<{
    content: z.ZodString;
}, z.core.$strip>;
export declare const searchPapersSchema: z.ZodObject<{
    query: z.ZodOptional<z.ZodString>;
    q: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<number, string>>>;
    offset: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<number, string>>>;
    source: z.ZodOptional<z.ZodEnum<{
        local: "local";
        arxiv: "arxiv";
    }>>;
}, z.core.$strip>;
export declare const savePaperSchema: z.ZodObject<{
    paperId: z.ZodOptional<z.ZodString>;
    externalPaper: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        authors: z.ZodArray<z.ZodString>;
        abstract: z.ZodString;
        url: z.ZodString;
        tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
        publishedDate: z.ZodOptional<z.ZodString>;
        citations: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    notes: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export declare const sendGroupInviteSchema: z.ZodObject<{
    userId: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const uuidParamSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const groupIdParamSchema: z.ZodObject<{
    groupId: z.ZodString;
}, z.core.$strip>;
export declare const sessionIdParamSchema: z.ZodObject<{
    sessionId: z.ZodString;
}, z.core.$strip>;
export declare const paginationSchema: z.ZodObject<{
    limit: z.ZodPipe<z.ZodDefault<z.ZodOptional<z.ZodString>>, z.ZodTransform<number, string>>;
    offset: z.ZodPipe<z.ZodDefault<z.ZodOptional<z.ZodString>>, z.ZodTransform<number, string>>;
}, z.core.$strip>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
//# sourceMappingURL=schemas.d.ts.map