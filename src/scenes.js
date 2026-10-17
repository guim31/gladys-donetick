// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// `complete_chore`: mark a Donetick chore done, by its name or its number, as
// the user of the API token — the button of an NFC tag by the bins, a voice
// command, the end of a washing machine cycle. The field is a string, so a
// scene variable fits too (`{{triggerEvent.data.chore}}`).
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  async complete_chore(hub, { fields = {} }) {
    const { chore, pendingApproval, nextDue } = await hub.complete(fields.chore);
    return {
      chore: chore.name,
      chore_id: chore.id,
      pending_approval: pendingApproval,
      next_due_date: nextDue === null ? '' : new Date(nextDue).toISOString(),
    };
  },
};
