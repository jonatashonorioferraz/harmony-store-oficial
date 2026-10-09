// Reviewed 2026-10-08: nine financial tables, composite FKs, immutable ledger and SELECT-only backup grants.
// Shared contract audited against public metadata on 2026-10-01. No production data.
// Reviewed 2026-10-08: source_evidence JSONB adds no keys, grants, triggers or tables.
// All retained event fields, including source evidence, remain in encrypted capture.
export const CATALOG_VERSION = 'harmony-public-2026-10-09-v1';
export const MIGRATIONS_SHA256 = '5a66f0f2b614aa47a246597ee7d1f7272c1e732b3bd8ef89be2aac71abde9600';
export const TABLE_CATALOG = [
{
  "name": "contract_documents",
  "primaryKey": [
    "id"
  ],
  "foreignKeys": [
    {
      "columns": [
        "created_by"
      ],
      "schema": "public",
      "table": "profiles",
      "deferrable": false,
      "targetColumns": [
        "id"
      ]
    },
    {
      "columns": [
        "contract_id",
        "entity_id"
      ],
      "schema": "public",
      "table": "financial_contracts",
      "deferrable": false,
      "targetColumns": [
        "id",
        "entity_id"
      ]
    },
    {
      "columns": [
        "payment_id",
        "contract_id",
        "entity_id"
      ],
      "schema": "public",
      "table": "contract_payments",
      "deferrable": false,
      "targetColumns": [
        "id",
        "contract_id",
        "entity_id"
      ]
    }
  ],
  "generated": [],
  "triggers": [
    "contract_documents_immutable",
    "contract_documents_no_truncate"
  ],
  "serviceSelect": true,
  "serviceInsert": false,
  "capture": true,
  "classification": "business",
  "retention": "Capture immutable private document metadata; originals belong to the private financial-contract-documents bucket. Long-term recovery is not certified."
},
  {
    "name": "admin_agenda_ai_runs",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "admin_agenda_ai_settings",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "updated_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "admin_agenda_ai_settings_touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "admin_agenda_production_order_events",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "actor_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "production_order_id"
        ],
        "schema": "public",
        "table": "production_orders",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "id",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "admin_agenda_production_order_states",
    "primaryKey": [
      "production_order_id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "completed_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "production_order_id"
        ],
        "schema": "public",
        "table": "production_orders",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "reopened_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "admin_agenda_order_states_touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "admin_agenda_reminder_deliveries",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "recipient_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "task_id"
        ],
        "schema": "public",
        "table": "admin_agenda_tasks",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "id",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [
      "admin_agenda_reminder_deliveries_touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "admin_agenda_task_events",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "actor_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "task_id"
        ],
        "schema": "public",
        "table": "admin_agenda_tasks",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "id",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "admin_agenda_tasks",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "completed_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "updated_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "protocol",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [
      "admin_agenda_tasks_touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "app_notification_recipients",
    "primaryKey": [
      "notification_id",
      "recipient_id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "notification_id"
        ],
        "schema": "public",
        "table": "app_notifications",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "recipient_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "app_notifications",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "target_profile_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "app_usage_sessions",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "user_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "telemetry",
    "retention": "Capture currently retained rows; application retention is 180 days."
  },
  {
    "name": "audit_logs",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "actor_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "id",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [
      "block_audit_log_truncate",
      "block_audit_log_update_delete"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "bill_ai_runs",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "id",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "bills",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "paid_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "updated_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "protocol",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [
      "touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "categories",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "collaborator_label_code_events",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "actor_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "collaborator_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "collaborator_label_codes",
    "primaryKey": [
      "collaborator_id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "assigned_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "collaborator_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "audit_collaborator_label_code",
      "protect_collaborator_label_code"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "commercial_calendar_audit",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "actor_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "id",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "commercial_calendar_events",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "reviewed_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "run_id"
        ],
        "schema": "public",
        "table": "commercial_calendar_runs",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "commercial_calendar_plans",
    "primaryKey": [
      "event_key"
    ],
    "foreignKeys": [
      {
        "columns": [
          "owner_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "updated_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "commercial_calendar_runs",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "commercial_calendar_settings",
    "primaryKey": [
      "singleton"
    ],
    "foreignKeys": [],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "commercial_calendar_sources",
    "primaryKey": [
      "domain"
    ],
    "foreignKeys": [],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "commercial_calendar_validation_authorizations",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "run_id"
        ],
        "schema": "public",
        "table": "commercial_calendar_runs",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": false,
    "serviceInsert": false,
    "capture": false,
    "classification": "ephemeral-authorization",
    "retention": "Not exported or replayed; generate a new expiring authorization in the destination."
  },
  {
    "name": "custom_field_definitions",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "custom_field_values",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "definition_id"
        ],
        "schema": "public",
        "table": "custom_field_definitions",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "product_id"
        ],
        "schema": "public",
        "table": "products",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "profile_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "finished_product_models",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "finished_models_touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "finished_production_colors",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "finished_production_colors_touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "finished_production_receipts",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "closing_id"
        ],
        "schema": "public",
        "table": "production_weekly_closings",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "model_id"
        ],
        "schema": "public",
        "table": "finished_product_models",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "received_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "worker_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "protocol",
        "identity": "a",
        "generated": ""
      },
      {
        "column": "quantity_difference",
        "identity": "",
        "generated": "s"
      }
    ],
    "triggers": [
      "finished_receipts_touch_updated_at",
      "validate_finished_production_color"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "improvement_idea_events",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "actor_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "idea_id"
        ],
        "schema": "public",
        "table": "improvement_ideas",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "id",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "improvement_ideas",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "protocol",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [
      "protect_improvement_idea_owner",
      "record_improvement_idea_event",
      "touch_improvement_ideas_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "internal_purchase_receipt_items",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "product_id"
        ],
        "schema": "public",
        "table": "products",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "receipt_id"
        ],
        "schema": "public",
        "table": "internal_purchase_receipts",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "enforce_internal_receipt_product"
    ],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "internal_purchase_receipts",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "confirmed_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "request_id"
        ],
        "schema": "public",
        "table": "internal_supply_requests",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "supplier_id"
        ],
        "schema": "public",
        "table": "suppliers",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "protocol",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [
      "touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "internal_receipt_ai_runs",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "id",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "internal_supply_request_item_fulfillments",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "receipt_item_id"
        ],
        "schema": "public",
        "table": "internal_purchase_receipt_items",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "request_item_id"
        ],
        "schema": "public",
        "table": "internal_supply_request_items",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "internal_supply_request_items",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "product_id"
        ],
        "schema": "public",
        "table": "products",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "request_id"
        ],
        "schema": "public",
        "table": "internal_supply_requests",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "enforce_internal_request_product"
    ],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "internal_supply_requests",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "requested_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "separated_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "protocol",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [
      "touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "inventory_ai_analyses",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "inventory_ai_insights",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "analysis_id"
        ],
        "schema": "public",
        "table": "inventory_ai_analyses",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "color_id"
        ],
        "schema": "public",
        "table": "finished_production_colors",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "dismissed_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "model_id"
        ],
        "schema": "public",
        "table": "finished_product_models",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "reviewed_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "worker_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "inventory_ai_settings",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "updated_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "inventory_ai_settings_touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "label_lot_events",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "actor_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "lot_id"
        ],
        "schema": "public",
        "table": "label_lots",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "label_lots",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "cancelled_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "collaborator_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "lot_number",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "product_collaborator_stocks",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "collaborator_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "product_id"
        ],
        "schema": "public",
        "table": "products",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "production_inventory_entries",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "color_id"
        ],
        "schema": "public",
        "table": "finished_production_colors",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "label_applied_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "label_cancelled_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "model_id"
        ],
        "schema": "public",
        "table": "finished_product_models",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "source_receipt_id"
        ],
        "schema": "public",
        "table": "finished_production_receipts",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "transferred_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "worker_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "protocol",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [
      "production_inventory_box_number_immutable",
      "production_inventory_entries_protect_shipping_reservation",
      "production_inventory_entries_touch_updated_at",
      "production_inventory_label_state_guard"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "production_inventory_label_prints",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "entry_id"
        ],
        "schema": "public",
        "table": "production_inventory_entries",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "printed_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "protocol",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "production_inventory_movements",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "entry_id"
        ],
        "schema": "public",
        "table": "production_inventory_entries",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "protocol",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [
      "production_inventory_movement_label_guard"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "production_order_items",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "color_id"
        ],
        "schema": "public",
        "table": "finished_production_colors",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "model_id"
        ],
        "schema": "public",
        "table": "finished_product_models",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "order_id"
        ],
        "schema": "public",
        "table": "production_orders",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "production_orders",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "acknowledged_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "cancelled_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "worker_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "protocol",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [
      "production_orders_touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "production_payment_schedules",
    "primaryKey": [
      "worker_id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "configured_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "worker_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "production_payment_schedules_touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "production_weekly_closings",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "closed_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "paid_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "worker_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "protocol",
        "identity": "a",
        "generated": ""
      },
      {
        "column": "week_end",
        "identity": "",
        "generated": "s"
      }
    ],
    "triggers": [
      "production_closings_touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "products",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "category_id"
        ],
        "schema": "public",
        "table": "categories",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "touch_updated_at",
      "validate_product_stock_control"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "profiles",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "id"
        ],
        "schema": "auth",
        "table": "users",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "sync_individual_stock_for_profile",
      "touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "purchase_order_items",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "product_id"
        ],
        "schema": "public",
        "table": "products",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "purchase_order_id"
        ],
        "schema": "public",
        "table": "purchase_orders",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "require_supplier_product_link"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "purchase_orders",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "supplier_id"
        ],
        "schema": "public",
        "table": "suppliers",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "protocol",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [
      "touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "push_subscriptions",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "user_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "request_items",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "product_id"
        ],
        "schema": "public",
        "table": "products",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "request_id"
        ],
        "schema": "public",
        "table": "requests",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "stock_owner_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "assign_request_item_stock_owner",
      "enforce_production_request_product"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "requests",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "requested_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "separated_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "protocol",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [
      "touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "separation_checkup_items",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "checked_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "product_id"
        ],
        "schema": "public",
        "table": "products",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "request_id"
        ],
        "schema": "public",
        "table": "requests",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "request_item_id"
        ],
        "schema": "public",
        "table": "request_items",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shipping_color_combination_items",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "color_id"
        ],
        "schema": "public",
        "table": "finished_production_colors",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "combination_id"
        ],
        "schema": "public",
        "table": "shipping_color_combinations",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shipping_color_combinations",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "updated_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "shipping_color_combinations_touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shipping_exclusive_products",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "default_color_id"
        ],
        "schema": "public",
        "table": "finished_production_colors",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "updated_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "shipping_exclusive_products_touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shipping_inventory_request_boxes",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "component_id"
        ],
        "schema": "public",
        "table": "shipping_plan_item_components",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "inventory_entry_id"
        ],
        "schema": "public",
        "table": "production_inventory_entries",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "released_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "request_id"
        ],
        "schema": "public",
        "table": "shipping_inventory_requests",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "request_item_id"
        ],
        "schema": "public",
        "table": "shipping_inventory_request_items",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "transferred_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shipping_inventory_request_items",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "color_id"
        ],
        "schema": "public",
        "table": "finished_production_colors",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "model_id"
        ],
        "schema": "public",
        "table": "finished_product_models",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "plan_component_id"
        ],
        "schema": "public",
        "table": "shipping_plan_item_components",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "removed_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "request_id"
        ],
        "schema": "public",
        "table": "shipping_inventory_requests",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shipping_inventory_requests",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "cancelled_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "dispatched_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "plan_id"
        ],
        "schema": "public",
        "table": "shipping_plans",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "plan_item_id"
        ],
        "schema": "public",
        "table": "shipping_plan_items",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "received_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "requested_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "transferred_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "protocol",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [
      "shipping_inventory_requests_touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shipping_kit_template_components",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "color_id"
        ],
        "schema": "public",
        "table": "finished_production_colors",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "kit_template_id"
        ],
        "schema": "public",
        "table": "shipping_kit_templates",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "model_id"
        ],
        "schema": "public",
        "table": "finished_product_models",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shipping_kit_templates",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "updated_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "shipping_kit_templates_touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shipping_plan_item_components",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "color_id"
        ],
        "schema": "public",
        "table": "finished_production_colors",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "model_id"
        ],
        "schema": "public",
        "table": "finished_product_models",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "plan_item_id"
        ],
        "schema": "public",
        "table": "shipping_plan_items",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shipping_plan_items",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "color_combination_id"
        ],
        "schema": "public",
        "table": "shipping_color_combinations",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "color_id"
        ],
        "schema": "public",
        "table": "finished_production_colors",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "completed_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "kit_template_id"
        ],
        "schema": "public",
        "table": "shipping_kit_templates",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "model_id"
        ],
        "schema": "public",
        "table": "finished_product_models",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "plan_id"
        ],
        "schema": "public",
        "table": "shipping_plans",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "normalize_shipping_plan_item_kind_on_insert",
      "shipping_plan_item_reopen_on_edit",
      "shipping_plan_items_touch_updated_at",
      "shipping_plan_reopen_ready_after_item"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shipping_plans",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "updated_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "protocol",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [
      "shipping_plans_release_inventory_reservations",
      "shipping_plans_touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shopee_ai_analyses",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shopee_ai_insights",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "analysis_id"
        ],
        "schema": "public",
        "table": "shopee_ai_analyses",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "dismissed_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "reviewed_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shopee_ai_settings",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "updated_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "shopee_ai_settings_touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shopee_import_batches",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "imported_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shopee_import_days",
    "primaryKey": [
      "report_type",
      "metric_date"
    ],
    "foreignKeys": [
      {
        "columns": [
          "batch_id"
        ],
        "schema": "public",
        "table": "shopee_import_batches",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shopee_product_funnel_daily",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "batch_id"
        ],
        "schema": "public",
        "table": "shopee_import_batches",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "id",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shopee_product_performance",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "batch_id"
        ],
        "schema": "public",
        "table": "shopee_import_batches",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "id",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shopee_promotion_campaigns",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "batch_id"
        ],
        "schema": "public",
        "table": "shopee_import_batches",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "id",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shopee_promotion_metrics",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "batch_id"
        ],
        "schema": "public",
        "table": "shopee_import_batches",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "id",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shopee_sales_daily",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "batch_id"
        ],
        "schema": "public",
        "table": "shopee_import_batches",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "id",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "shopee_traffic_sources",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "batch_id"
        ],
        "schema": "public",
        "table": "shopee_import_batches",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "id",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "stock_discrepancies",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "product_id"
        ],
        "schema": "public",
        "table": "products",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "recorded_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "request_id"
        ],
        "schema": "public",
        "table": "requests",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "request_item_id"
        ],
        "schema": "public",
        "table": "request_items",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "reviewed_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "stock_owner_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "stock_movements",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "internal_receipt_id"
        ],
        "schema": "public",
        "table": "internal_purchase_receipts",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "internal_request_id"
        ],
        "schema": "public",
        "table": "internal_supply_requests",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "product_id"
        ],
        "schema": "public",
        "table": "products",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "request_id"
        ],
        "schema": "public",
        "table": "requests",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "stock_owner_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "stock_replenishment_requests",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "completed_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "product_id"
        ],
        "schema": "public",
        "table": "products",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "source_request_id"
        ],
        "schema": "public",
        "table": "requests",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "source_request_item_id"
        ],
        "schema": "public",
        "table": "request_items",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "stock_owner_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "supplier_products",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "product_id"
        ],
        "schema": "public",
        "table": "products",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "supplier_id"
        ],
        "schema": "public",
        "table": "suppliers",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "suppliers",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "touch_updated_at"
    ],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained rows; encrypted artifact retention is 30 days."
  },
  {
    "name": "system_backup_runs",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "telemetry",
    "retention": "Capture all currently retained rows; this change does not purge production telemetry."
  },
  {
    "name": "system_events",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "actor_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [
      {
        "column": "id",
        "identity": "a",
        "generated": ""
      }
    ],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": true,
    "capture": true,
    "classification": "telemetry",
    "retention": "Capture all currently retained rows; this change does not purge production telemetry."
  },
  {
    "name": "financial_entities",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained financial rows, including reversals and audit; encrypted artifact retention is currently 30 days. Long-term recovery is not yet certified."
  },
  {
    "name": "financial_permissions",
    "primaryKey": [
      "entity_id",
      "profile_id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "entity_id"
        ],
        "schema": "public",
        "table": "financial_entities",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "profile_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "granted_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained financial rows, including reversals and audit; encrypted artifact retention is currently 30 days. Long-term recovery is not yet certified."
  },
  {
    "name": "financial_contracts",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "entity_id"
        ],
        "schema": "public",
        "table": "financial_entities",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      }
    ],
    "generated": [],
    "triggers": [],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained financial rows, including reversals and audit; encrypted artifact retention is currently 30 days. Long-term recovery is not yet certified."
  },
  {
    "name": "contract_schedule_versions",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "contract_id",
          "entity_id"
        ],
        "schema": "public",
        "table": "financial_contracts",
        "deferrable": false,
        "targetColumns": [
          "id",
          "entity_id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "contract_schedule_versions_immutable",
      "contract_schedule_versions_no_truncate"
    ],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained financial rows, including reversals and audit; encrypted artifact retention is currently 30 days. Long-term recovery is not yet certified."
  },
  {
    "name": "contract_installments",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "schedule_id",
          "contract_id",
          "entity_id"
        ],
        "schema": "public",
        "table": "contract_schedule_versions",
        "deferrable": false,
        "targetColumns": [
          "id",
          "contract_id",
          "entity_id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "contract_installments_immutable",
      "contract_installments_no_truncate"
    ],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained financial rows, including reversals and audit; encrypted artifact retention is currently 30 days. Long-term recovery is not yet certified."
  },
  {
    "name": "contract_payments",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "contract_id",
          "entity_id"
        ],
        "schema": "public",
        "table": "financial_contracts",
        "deferrable": false,
        "targetColumns": [
          "id",
          "entity_id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "contract_payments_immutable",
      "contract_payments_no_truncate"
    ],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained financial rows, including reversals and audit; encrypted artifact retention is currently 30 days. Long-term recovery is not yet certified."
  },
  {
    "name": "contract_payment_allocations",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "payment_id",
          "contract_id",
          "entity_id"
        ],
        "schema": "public",
        "table": "contract_payments",
        "deferrable": false,
        "targetColumns": [
          "id",
          "contract_id",
          "entity_id"
        ]
      },
      {
        "columns": [
          "installment_id",
          "contract_id",
          "entity_id"
        ],
        "schema": "public",
        "table": "contract_installments",
        "deferrable": false,
        "targetColumns": [
          "id",
          "contract_id",
          "entity_id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "contract_payment_allocations_immutable",
      "contract_payment_allocations_no_truncate"
    ],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained financial rows, including reversals and audit; encrypted artifact retention is currently 30 days. Long-term recovery is not yet certified."
  },
  {
    "name": "contract_payment_reversals",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "created_by"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "payment_id",
          "contract_id",
          "entity_id"
        ],
        "schema": "public",
        "table": "contract_payments",
        "deferrable": false,
        "targetColumns": [
          "id",
          "contract_id",
          "entity_id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "contract_payment_reversals_immutable",
      "contract_payment_reversals_no_truncate"
    ],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained financial rows, including reversals and audit; encrypted artifact retention is currently 30 days. Long-term recovery is not yet certified."
  },
  {
    "name": "contract_audit_events",
    "primaryKey": [
      "id"
    ],
    "foreignKeys": [
      {
        "columns": [
          "entity_id"
        ],
        "schema": "public",
        "table": "financial_entities",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "actor_id"
        ],
        "schema": "public",
        "table": "profiles",
        "deferrable": false,
        "targetColumns": [
          "id"
        ]
      },
      {
        "columns": [
          "contract_id",
          "entity_id"
        ],
        "schema": "public",
        "table": "financial_contracts",
        "deferrable": false,
        "targetColumns": [
          "id",
          "entity_id"
        ]
      }
    ],
    "generated": [],
    "triggers": [
      "contract_audit_events_immutable",
      "contract_audit_events_no_truncate"
    ],
    "serviceSelect": true,
    "serviceInsert": false,
    "capture": true,
    "classification": "business",
    "retention": "Capture all retained financial rows, including reversals and audit; encrypted artifact retention is currently 30 days. Long-term recovery is not yet certified."
  }
];
export const CAPTURE_TABLES = TABLE_CATALOG.filter(table => table.capture);
export const EXCLUDED_TABLES = TABLE_CATALOG.filter(table => !table.capture);
export function recoveryOrder(catalog = CAPTURE_TABLES) {
  const pending = new Map(catalog.map(table => [table.name, table]));
  if (pending.size !== catalog.length) throw new Error('Tabela duplicada no catálogo.');
  const names = new Set(TABLE_CATALOG.map(table => table.name));
  for (const table of catalog) for (const fk of table.foreignKeys) {
    if (fk.schema === 'public' && !names.has(fk.table)) throw new Error('Dependência desconhecida: ' + fk.table);
  }
  const ordered = [];
  while (pending.size) {
    const ready = [...pending.values()].filter(table => table.foreignKeys.every(fk => fk.schema !== 'public' || !pending.has(fk.table)));
    if (!ready.length) throw new Error('Ciclo de chaves estrangeiras: plano SQL isolado necessário.');
    for (const table of ready) { ordered.push(table); pending.delete(table.name); }
  }
  return ordered;
}
