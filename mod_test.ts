import { assertEquals } from "@std/assert";
import { createFSM } from "./mod.ts";
import z from "zod";

Deno.test(async function works() {
    // Define the record type that represents all possible states
    // The `.state` field tracks which state the record is currently in
    type UserRecord = {
        state: "CREATED" | "VERIFIED" | "ONBOARDED";
        email: string;
        verified_at: Date | null;
        full_name: string | null;
    };

    const fsm = createFSM<UserRecord>()
        // A place to save the subject after each transition
        .withSaver(async (_subject) => {
            await Promise.resolve();
        })
        // Define each possible state
        .addSchemas({
            // Initial state: user just created
            CREATED: z.object({
                email: z.string().email(),
                verified_at: z.null(),
                full_name: z.null(),
            }),
            // Email verified: `verified_at` becomes required
            VERIFIED: z.object({
                email: z.string().email(),
                verified_at: z.date(),
                full_name: z.null(),
            }),
            // Onboarding complete: `full_name` becomes required
            ONBOARDED: z.object({
                email: z.string().email(),
                verified_at: z.date(),
                full_name: z.string(),
            }),
        })
        // Define available transitions
        .addTransition({
            name: "MARK_VERIFIED",
            from: "CREATED",
            to: "VERIFIED",
            // Transform subject to match `to` schema
            action: (subject) => ({
                ...subject,
                verified_at: new Date(),
            }),
        })
        .addTransition({
            name: "ONBOARD",
            from: "VERIFIED",
            to: "ONBOARDED",
            action: (subject, context: { full_name: string }) => ({
                ...subject,
                full_name: context.full_name,
            }),
        });

    const record_created = {
        state: "CREATED",
        email: "me@example.com",
        full_name: null,
        verified_at: null,
    } satisfies UserRecord;

    const record_verified = await fsm
        .execute("MARK_VERIFIED", {
            record: record_created,
            context: {},
        });

    const record_onboarded = await fsm
        .execute("ONBOARD", {
            record: record_verified,
            context: { full_name: "John Doe" },
        });

    // Type safety: full_name is guaranteed to be a string in ONBOARDED state
    assertEquals(typeof record_onboarded.full_name, "string");
});
