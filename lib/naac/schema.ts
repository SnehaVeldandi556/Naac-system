// lib/naac/schema.ts
import { z } from 'zod';

export const naacRowSchema = z.record(z.string(), z.any());

export type NaacRow = Record<string, any>;