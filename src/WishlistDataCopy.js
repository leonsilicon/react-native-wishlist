export function createItemsDataStructure(initialDeque) {
    'worklet';
    // RN worklets objects / arrays are proxies need to be deep cloned to
    // work properly in some cases. Ideally this would not be needed.
    function deepClone(x) {
        if (typeof x === 'object' && x !== null) {
            // rn-worklet arrays are proxy and Array.isArray doesn't work.
            if (typeof x.map === 'function') {
                return x.map((ele) => deepClone(ele));
            }
            else {
                const res = {};
                for (let key of Object.keys(x)) {
                    res[key] = deepClone(x[key]);
                }
                return res;
            }
        }
        return x;
    }
    // classes doesn't work :(
    // TODO it can be implemented so that all ops are O(log n)
    const thiz = {
        getIndex: function getIndex(key) {
            // That's linear but can be log n (only for testing)
            for (let i = 0; i < this.__deque.length; ++i) {
                if (this.__deque[i].key === key) {
                    return i - this.__numberOfNegative;
                }
            }
            return undefined;
        },
        at: function at(indexInput) {
            const index = indexInput + this.__numberOfNegative;
            if (index == null || index >= this.length || index < 0) {
                return undefined;
            }
            return this.__deque[index];
        },
        get length() {
            return this.__deque.length;
        },
        getItem: function get(key) {
            const index = this.getIndex(key);
            if (index == null) {
                return undefined;
            }
            return this.at(index);
        },
        setItem: function setItem(key, value) {
            const index = this.getIndex(key);
            if (index == null) {
                return;
            }
            this.setAt(index, value);
        },
        removeItem: function removeItem(key) {
            const index = this.getIndex(key);
            if (index == null) {
                return;
            }
            this.__deque.splice(index + this.__numberOfNegative, 1);
            if (index < 0) {
                this.__numberOfNegative--;
            }
            if (this.__isTrackingChanges) {
                this.__dirtyIndexes.push(index);
            }
        },
        setAt: function setAt(index, value) {
            this.__deque[index + this.__numberOfNegative] = deepClone(value);
            if (this.__isTrackingChanges) {
                this.__dirtyIndexes.push(index);
            }
        },
        push: function push(value) {
            this.__deque.push(deepClone(value));
        },
        unshift: function unshift(value) {
            this.__deque.unshift(deepClone(value));
            this.__numberOfNegative++;
        },
        setItems: function reset(items) {
            if (this.__isTrackingChanges) {
                this.__deque.forEach((_item, i) => this.__dirtyIndexes.push(i));
            }
            this.__deque = deepClone(items);
            this.__numberOfNegative = 0;
        },
        __applyChanges: function __applyChanges(pendingUpdates) {
            this.__isTrackingChanges = true;
            for (let updateJob of pendingUpdates) {
                updateJob(this);
            }
            this.__isTrackingChanges = false;
            const res = this.__dirtyIndexes.map((i) => i);
            this.__dirtyIndexes = [];
            return res;
        },
        __deque: deepClone(initialDeque),
        __numberOfNegative: 0, // allow negative indexes so that indices are constant
        __dirtyIndexes: [],
        __isTrackingChanges: false,
    };
    return thiz;
}
