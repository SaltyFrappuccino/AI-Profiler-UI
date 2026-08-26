ALTER TABLE ai_profiler.field_links
    ADD CONSTRAINT field_links_contract_fk
    FOREIGN KEY (snapshot_id, contract_id)
    REFERENCES ai_profiler.contracts(snapshot_id, contract_id)
    ON DELETE CASCADE;

ALTER TABLE ai_profiler.process_relations
    ADD CONSTRAINT process_relations_source_step_fk
    FOREIGN KEY (snapshot_id, process_id, source_step_id)
    REFERENCES ai_profiler.process_steps(snapshot_id, process_id, step_id)
    ON DELETE CASCADE;

ALTER TABLE ai_profiler.process_relations
    ADD CONSTRAINT process_relations_target_step_fk
    FOREIGN KEY (snapshot_id, process_id, target_step_id)
    REFERENCES ai_profiler.process_steps(snapshot_id, process_id, step_id)
    ON DELETE CASCADE;
