import { assertEquals } from "@std/assert";
import { createFSM } from "./mod.ts";

Deno.test(async function works() {
    type FsmStates = "ACTIVE" | "INACTIVE";
    type FsmEntity = { state: FsmStates };
    type FsmCtx = Record<string, never>;

    const fsm = createFSM<FsmStates, FsmEntity, FsmCtx>({
        ACTIVE: ["INACTIVE"],
        INACTIVE: ["ACTIVE"],
    }, {
        getState(entity) {
            return entity.state;
        },
        async onTransition({ state, sourceState, entity, ctx }) {
            return {
                ...entity,
                state: state,
            };
        },
    });

    const fsmForActive = fsm({ state: "ACTIVE" }, {});

    assertEquals(fsmForActive.currentState, "ACTIVE");
    assertEquals(fsmForActive.availableStates, ["INACTIVE"]);
    assertEquals(fsmForActive.can("INACTIVE"), true);

    const fsmForInactive = await fsmForActive.transition("INACTIVE");

    assertEquals(fsmForInactive.currentState, "INACTIVE");
    assertEquals(fsmForInactive.availableStates, ["ACTIVE"]);
    assertEquals(fsmForInactive.can("ACTIVE"), true);
});
