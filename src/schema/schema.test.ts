import { describe, it, expect } from 'vitest';
import { schema, column, getPrimaryKeyFields, getUniqueFields, validateSchema } from './builder.js';
import { hasMany, hasOne, belongsTo, belongsToMany } from './types.js';
import type { InferEntity } from './types.js';

describe('Schema Definition System', () => {
  describe('column builders', () => {
    it('should create basic column definitions', () => {
      const stringCol = column.string().build();
      expect(stringCol).toEqual({ type: 'string' });

      const numberCol = column.number().nullable().build();
      expect(numberCol).toEqual({ type: 'number', nullable: true });

      const uuidCol = column.uuid().primary().default('gen_random_uuid()').build();
      expect(uuidCol).toEqual({
        type: 'uuid',
        primary: true,
        default: 'gen_random_uuid()',
      });
    });

    it('should handle column constraints', () => {
      const emailCol = column.string().unique().length(255).build();
      expect(emailCol).toEqual({
        type: 'string',
        unique: true,
        length: 255,
      });

      const priceCol = column.decimal().precision(10, 2).build();
      expect(priceCol).toEqual({
        type: 'decimal',
        precision: 10,
        scale: 2,
      });
    });

    it('should handle default values', () => {
      const activeCol = column.boolean().default(true).build();
      expect(activeCol.default).toBe(true);

      const countCol = column.number().default(0).build();
      expect(countCol.default).toBe(0);

      const createdCol = column.timestamp().default('now()').build();
      expect(createdCol.default).toBe('now()');

      const computedCol = column.string().default(() => 'computed').build();
      expect(typeof computedCol.default).toBe('function');
    });
  });

  describe('schema builder', () => {
    it('should create a basic schema', () => {
      const UserSchema = schema('User', {
        id: column.uuid().primary(),
        name: column.string(),
        email: column.string().unique(),
      }).build();

      expect(UserSchema.name).toBe('User');
      expect(UserSchema.columns).toHaveProperty('id');
      expect(UserSchema.columns).toHaveProperty('name');
      expect(UserSchema.columns).toHaveProperty('email');
      expect(UserSchema.columns.id.primary).toBe(true);
      expect(UserSchema.columns.email.unique).toBe(true);
    });

    it('should handle custom table names', () => {
      const UserSchema = schema('User', {
        id: column.uuid().primary(),
      })
        .tableName('app_users')
        .build();

      expect(UserSchema.tableName).toBe('app_users');
    });

    it('should handle indexes', () => {
      const UserSchema = schema('User', {
        id: column.uuid().primary(),
        email: column.string(),
        name: column.string(),
        createdAt: column.timestamp(),
      })
        .indexes(
          { columns: ['email'], unique: true },
          { columns: ['name', 'createdAt'] },
          { columns: ['createdAt'], where: 'createdAt > NOW() - INTERVAL 30 DAY' }
        )
        .build();

      expect(UserSchema.indexes).toHaveLength(3);
      expect(UserSchema.indexes![0]).toEqual({
        columns: ['email'],
        unique: true,
      });
      expect(UserSchema.indexes![2].where).toBeDefined();
    });

    it('should handle check constraints', () => {
      const UserSchema = schema('User', {
        id: column.uuid().primary(),
        age: column.number(),
      })
        .checks(
          { name: 'age_check', expression: 'age >= 0 AND age <= 150' },
          { name: 'id_format', expression: "id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-'" }
        )
        .build();

      expect(UserSchema.checks).toHaveLength(2);
      expect(UserSchema.checks![0].name).toBe('age_check');
    });
  });

  describe('relations', () => {
    it('should define one-to-many relations', () => {
      const PostSchema = schema('Post', {
        id: column.uuid().primary(),
        authorId: column.uuid(),
      }).build();

      const UserSchema = schema('User', {
        id: column.uuid().primary(),
      })
        .relations({
          posts: hasMany(() => PostSchema, 'authorId'),
        })
        .build();

      expect(UserSchema.relations).toBeDefined();
      expect(UserSchema.relations!.posts.type).toBe('hasMany');
      expect(UserSchema.relations!.posts.foreignKey).toBe('authorId');
    });

    it('should define many-to-many relations', () => {
      const PostTagSchema = schema('PostTag', {
        postId: column.uuid(),
        tagId: column.uuid(),
      }).build();

      const TagSchema = schema('Tag', {
        id: column.uuid().primary(),
      }).build();

      const PostSchema = schema('Post', {
        id: column.uuid().primary(),
      })
        .relations({
          tags: belongsToMany(() => TagSchema, () => PostTagSchema),
        })
        .build();

      expect(PostSchema.relations!.tags.type).toBe('belongsToMany');
      expect(PostSchema.relations!.tags.through).toBeDefined();
    });

    it('should handle cascade options', () => {
      const PostSchema = schema('Post', {
        id: column.uuid().primary(),
      }).build();

      const UserSchema = schema('User', {
        id: column.uuid().primary(),
      })
        .relations({
          posts: hasMany(() => PostSchema, 'authorId', {
            cascade: ['insert', 'update'],
          }),
        })
        .build();

      expect(UserSchema.relations!.posts.cascade).toEqual(['insert', 'update']);
    });
  });

  describe('type inference', () => {
    it('should infer correct types from schema', () => {
      const UserSchema = schema('User', {
        id: column.uuid().primary(),
        name: column.string(),
        age: column.number().nullable(),
        isActive: column.boolean().default(true),
        metadata: column.json<{ preferences: string[] }>(),
      }).build();

      type User = InferEntity<typeof UserSchema>;

      // This is a compile-time check
      const user: User = {
        id: 'uuid',
        name: 'John',
        age: null, // can be null
        isActive: true,
        metadata: { preferences: ['dark-mode'] },
      };

      expect(user).toBeDefined();
    });

    it('should enforce nullable constraints in types', () => {
      const TestSchema = schema('Test', {
        required: column.string(),
        optional: column.string().nullable(),
      }).build();

      type Test = InferEntity<typeof TestSchema>;

      const valid: Test = {
        required: 'value',
        optional: null,
      };

      expect(valid).toBeDefined();

      // TypeScript would error on these:
      // const invalid1: Test = {
      //   required: null, // Error: Type 'null' is not assignable to type 'string'
      //   optional: 'value',
      // };
    });
  });

  describe('schema utilities', () => {
    it('should get primary key fields', () => {
      const UserSchema = schema('User', {
        id: column.uuid().primary(),
        email: column.string().unique(),
        name: column.string(),
      }).build();

      const primaryKeys = getPrimaryKeyFields(UserSchema);
      expect(primaryKeys).toEqual(['id']);
    });

    it('should get unique fields', () => {
      const UserSchema = schema('User', {
        id: column.uuid().primary(),
        email: column.string().unique(),
        username: column.string().unique(),
        name: column.string(),
      }).build();

      const uniqueFields = getUniqueFields(UserSchema);
      expect(uniqueFields).toContain('email');
      expect(uniqueFields).toContain('username');
      expect(uniqueFields).not.toContain('name');
    });

    it('should validate schema - missing primary key', () => {
      const InvalidSchema = schema('Invalid', {
        name: column.string(),
      }).build();

      expect(() => validateSchema(InvalidSchema)).toThrow(
        'must have at least one primary key'
      );
    });

    it('should validate schema - invalid index column', () => {
      const InvalidSchema = schema('Invalid', {
        id: column.uuid().primary(),
        name: column.string(),
      })
        .indexes({ columns: ['nonexistent'] })
        .build();

      expect(() => validateSchema(InvalidSchema)).toThrow(
        'Index references non-existent column: nonexistent'
      );
    });

    it('should validate schema - invalid foreign key', () => {
      const OtherSchema = schema('Other', {
        id: column.uuid().primary(),
      }).build();

      const InvalidSchema = schema('Invalid', {
        id: column.uuid().primary(),
      })
        .relations({
          other: belongsTo(() => OtherSchema, 'nonexistentId'),
        })
        .build();

      expect(() => validateSchema(InvalidSchema)).toThrow(
        'Relation other references non-existent foreign key: nonexistentId'
      );
    });

    it('should validate valid schema', () => {
      const ValidSchema = schema('Valid', {
        id: column.uuid().primary(),
        name: column.string(),
        email: column.string().unique(),
      })
        .indexes({ columns: ['name', 'email'] })
        .build();

      expect(() => validateSchema(ValidSchema)).not.toThrow();
    });
  });

  describe('complex schemas', () => {
    it('should handle composite primary keys', () => {
      const CompositeSchema = schema('Composite', {
        tenantId: column.uuid().primary(),
        userId: column.uuid().primary(),
        role: column.string(),
      }).build();

      const primaryKeys = getPrimaryKeyFields(CompositeSchema);
      expect(primaryKeys).toEqual(['tenantId', 'userId']);
    });

    it('should handle all column types', () => {
      const AllTypesSchema = schema('AllTypes', {
        id: column.uuid().primary(),
        string: column.string(),
        number: column.number(),
        bigint: column.bigint(),
        boolean: column.boolean(),
        date: column.date(),
        timestamp: column.timestamp(),
        json: column.json(),
        text: column.text(),
        decimal: column.decimal(),
      }).build();

      expect(Object.keys(AllTypesSchema.columns)).toHaveLength(10);
      expect(AllTypesSchema.columns.decimal.type).toBe('decimal');
    });
  });
});