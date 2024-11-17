export type TransitionsDef<S extends string> = Record<S, S[]>;

type FSMDef<StateType extends string, Entity extends Record<string, unknown>> =
    {
        currentState: StateType;
        availableStates: StateType[];
        entity: Entity;
        can(state: StateType): boolean;
        transition(state: StateType): Promise<FSMDef<StateType, Entity>>;
    };

type FSMCreate<
    StateType extends string,
    Entity extends Record<string, unknown>,
    Ctx extends Record<string, unknown>,
> = (
    entity: Entity,
    ctx: Ctx,
) => FSMDef<StateType, Entity>;

export function createFSM<
    StateType extends string,
    Entity extends Record<string, unknown>,
    Ctx extends Record<string, unknown>,
>(
    def: TransitionsDef<StateType>,
    opts: {
        getState(entity: Entity): StateType;
        onTransition(data: {
            state: StateType;
            sourceState: StateType;
            ctx: Ctx;
            entity: Entity;
        }): Promise<Entity>;
    },
): FSMCreate<StateType, Entity, Ctx> {
    function create(entity: Entity, ctx: Ctx) {
        const currentState = opts.getState(entity);
        const availableStates = def[currentState];

        return {
            currentState,
            availableStates,
            entity: entity,

            can(state: StateType) {
                return availableStates.includes(state);
            },

            transition: async (state: StateType) => {
                const can = availableStates.includes(state);
                if (!can) {
                    throw new Error("Invalid state transition");
                }

                const updatedEntity = await opts.onTransition({
                    state,
                    sourceState: currentState,
                    ctx,
                    entity,
                });

                return create(updatedEntity, ctx);
            },
        };
    }

    return create;
}
