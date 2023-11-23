module transaction_arguments::example {
    use std::string::{String};
    use aptos_framework::object::{Self, Object, ExtendRef};
    use std::signer;

    /// You are not the deployer of this contract.
    const E_NOT_DEPLOYER: u64 = 0;

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct SomeResource<V1: copy + drop + store, V2: copy + drop + store, V3: copy + drop + store> has key {
        my_bool: bool,
        my_u64: u64,
        my_string: String,
        value_1: V1,
        value_2: V2,
        value_3: V3,
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct MyExtendRef has key {
        extend_ref: ExtendRef,
    }

    struct ContractData has key {
        obj_addr: address,
    }

    fun init_module(deployer: &signer) {
        assert!(signer::address_of(deployer) == @transaction_arguments, E_NOT_DEPLOYER);
        let constructor_ref = object::create_object(@transaction_arguments);
        let obj_signer = object::generate_signer(&constructor_ref);
        move_to(
            &obj_signer,
            MyExtendRef {
                extend_ref: object::generate_extend_ref(&constructor_ref),
            }
        );
        move_to(
            deployer,
            ContractData {
                obj_addr: object::address_from_constructor_ref(&constructor_ref),
            }
        )
    }

    public entry fun move_values_to_object<V1: copy + drop + store, V2: copy + drop + store, V3: copy + drop + store>(
        deployer: &signer,
        second_signer: &signer,
        third_signer: &signer,
        my_bool: bool,
        my_u64: u64,
        my_string: String,
        value_1: V1,
        value_2: V2,
        value_3: V3,
    ) acquires ContractData, MyExtendRef {
        // we throw these away because we're not using them, just showing how multiple signers would work in the generated code
        let _ = second_signer;
        let _ = third_signer;
        assert!(signer::address_of(deployer) == @transaction_arguments, E_NOT_DEPLOYER);
        // throw this away because we're not using it
        
        // get the object's signer so we can move SomeResource<V1, V2, V3> onto it
        let obj_addr = borrow_global<ContractData>(@transaction_arguments).obj_addr;
        let extend_ref = &borrow_global<MyExtendRef>(obj_addr).extend_ref;
        let obj_signer = object::generate_signer_for_extending(extend_ref);
        move_to(
            &obj_signer,
            SomeResource<V1, V2, V3> {
                my_bool: my_bool,
                my_u64: my_u64,
                my_string: my_string,
                value_1: value_1,
                value_2: value_2,
                value_3: value_3,
            }
        );
    }

    #[view]
    public fun get_obj_address(): address acquires ContractData {
        borrow_global<ContractData>(@transaction_arguments).obj_addr
    }

    #[view]
    public fun view_object_values<T: key, V1: copy + drop + store, V2: copy + drop + store, V3: copy + drop + store>(
        obj: Object<T>,
    ): (
        bool,
        u64,
        String,
        V1,
        V2,
        V3,
    ) acquires SomeResource {
        let obj_addr = object::object_address<T>(&obj);
        let some_resource = borrow_global<SomeResource<V1, V2, V3>>(obj_addr);
        return (
            some_resource.my_bool,
            some_resource.my_u64,
            some_resource.my_string,
            some_resource.value_1,
            some_resource.value_2,
            some_resource.value_3,
        )
    }
}