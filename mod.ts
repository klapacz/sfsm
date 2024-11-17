export type TransitionsDef<S extends string> = Record<S, S[]>;

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
) {
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
