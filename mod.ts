// deno-lint-ignore-file no-explicit-any
import { z } from "zod";
type SubjectShape = { state: string };

type TSubjectStateSchema<TSubject extends SubjectShape> = z.ZodObject<
    {
        [TKey in Exclude<keyof TSubject, "state">]: z.ZodTypeAny;
    },
    "strip",
    z.ZodTypeAny,
    Omit<TSubject, "state">,
    Omit<TSubject, "state">
>;

type StoredStateSchemas<TSubject extends SubjectShape> = {
    [TState in TSubject["state"]]: TSubjectStateSchema<TSubject>;
};

type SaverAsync<TSubject extends SubjectShape> = (
    subject: TSubject,
) => Promise<void>;

type TransitionStatePath = "from" | "to";

type ExtractState<
    TTransition,
    TPath extends TransitionStatePath,
    TState = TPath extends keyof TTransition ? TTransition[TPath] : never,
> = TState;

type ExtractSchemaForState<
    TTransition,
    TPath extends TransitionStatePath,
    TSchemas,
    TState = ExtractState<TTransition, TPath>,
    TSchema = TState extends keyof TSchemas ? TSchemas[TState] : never,
    TInput = TSchema extends z.ZodType<any, any, any> ? z.input<TSchema>
        : never,
> = TInput;

type Transition<
    TSubject extends SubjectShape,
    TSchemas extends StoredStateSchemas<TSubject>,
    TName extends string,
    TFrom extends keyof TSchemas,
    TTo extends keyof TSchemas,
    TContext extends ContextUnknown = ContextNever,
> = {
    name: TName;
    from: TFrom;
    to: TTo;
    action: (
        subject: z.output<TSchemas[TFrom]> & { state: TFrom },
        context: TContext,
    ) => Promise<z.input<TSchemas[TTo]>> | z.input<TSchemas[TTo]>;
};

type TransitionName<TTransitions extends Transitions<any, any>> =
    TTransitions[number]["name"];

type ExtractTransitionByName<
    TTransitions extends any[] | readonly any[],
    TName,
> = Extract<TTransitions[number], { name: TName }>;

type TransitionOutput<
    TSubject extends SubjectShape,
    TSchemas extends StoredStateSchemas<TSubject>,
    TTransition,
> = ExtractSchemaForState<TTransition, "to", TSchemas> & {
    state: ExtractState<TTransition, "to">;
};

type TransitionInput<
    TSubject extends SubjectShape,
    TSchemas extends StoredStateSchemas<TSubject>,
    TTransition,
> = ExtractSchemaForState<TTransition, "from", TSchemas> & {
    state: ExtractState<TTransition, "from">;
};

type TransitionContext<
    TSubject extends SubjectShape,
    TSchemas extends StoredStateSchemas<TSubject>,
    TTransition,
> = TTransition extends Transition<
    TSubject,
    TSchemas,
    any,
    any,
    any,
    infer TContext
> ? TContext
    : never;

type Transitions<
    TSubject extends SubjectShape,
    TSchemas extends StoredStateSchemas<TSubject>,
> = readonly Transition<TSubject, TSchemas, any, any, any, any>[];

type ContextNever = Record<string, never>;
type ContextUnknown = Record<string, unknown>;

function createExpectStateSchema(state: string) {
    return z.object({
        state: z.literal(state),
    });
}

export function createFSM<TSubject extends SubjectShape>() {
    return {
        withSaver(saver: SaverAsync<TSubject>) {
            return {
                addSchemas<TSchemas extends StoredStateSchemas<TSubject>>(
                    schemas: TSchemas,
                ) {
                    const builder = <
                        TTransitions extends Transitions<TSubject, TSchemas>,
                    >(
                        transitions: TTransitions,
                    ) => {
                        const execute: ExecuteFnFactory<
                            TSubject,
                            TSchemas,
                            TTransitions,
                            "strict"
                        > = async (name, { record: rawRecord, context }) => {
                            // Find transition
                            const transition = transitions.find((t) =>
                                t.name === name
                            );
                            if (!transition) {
                                throw new Error(
                                    `Transition '${name}' not found`,
                                );
                            }

                            // Cast
                            const from = transition.from as TSubject["state"];
                            const to = transition.to as TSubject["state"];

                            // Check input state field
                            createExpectStateSchema(from).parse(rawRecord);

                            // Check rest of input schema
                            const inputSchema = schemas[from];
                            const validatedRecord = inputSchema.parse(
                                rawRecord,
                            );

                            // Run transition action
                            const output = await transition.action(
                                { ...validatedRecord, state: from },
                                context,
                            );

                            // validate output
                            const outputSchema = schemas[to];
                            const validatedOutput = outputSchema.parse(output);
                            const completeOutput = {
                                state: to,
                                ...validatedOutput,
                            };

                            // Save
                            await saver(completeOutput as TSubject);

                            return completeOutput as any;
                        };

                        const executeUnsafe =
                            execute as unknown as ExecuteFnFactory<
                                TSubject,
                                TSchemas,
                                TTransitions,
                                "loose"
                            >;

                        return {
                            _transitions: transitions,
                            addTransition<
                                TName extends string,
                                TFrom extends keyof TSchemas,
                                TTo extends keyof TSchemas,
                                TContext extends ContextUnknown = ContextNever,
                            >(
                                opts: Transition<
                                    TSubject,
                                    TSchemas,
                                    TName,
                                    TFrom,
                                    TTo,
                                    TContext
                                >,
                            ) {
                                return builder([...transitions, opts] as const);
                            },
                            execute,
                            executeUnsafe,
                            inputForState<TState extends keyof TSchemas>(
                                _state: TState,
                            ): z.input<TSchemas[TState]> {
                                return undefined as any;
                                // return schemas[state].input();
                            },
                        };
                    };

                    return builder([] as const);
                },
            };
        },
    };
}

type ExecuteFnFactory<
    TSubject extends SubjectShape,
    TSchemas extends StoredStateSchemas<TSubject>,
    TTransitions extends Transitions<TSubject, TSchemas>,
    TMode extends "strict" | "loose",
> = <
    TName extends TransitionName<TTransitions>,
    TTransition = ExtractTransitionByName<TTransitions, TName>,
>(
    name: TName,
    opts: {
        record: TMode extends "strict"
            ? NoInfer<TransitionInput<TSubject, TSchemas, TTransition>>
            : NoInfer<TSubject>;
        context: TransitionContext<TSubject, TSchemas, TTransition>;
    },
) => Promise<TransitionOutput<TSubject, TSchemas, TTransition>>;
