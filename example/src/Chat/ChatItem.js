import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTemplateValue, Wishlist, useWishlistContextData, } from 'react-native-wishlist';
const addReaction = require('./assets/add_reaction.png');
export const Reaction = () => {
    const emoji = useTemplateValue((item) => {
        return item.emoji;
    });
    const count = useTemplateValue((item) => {
        return item.ids.length;
    });
    const showCounter = useTemplateValue(() => {
        return count.value() > 1;
    });
    const handler = (value, rootValue) => {
        'worklet';
        console.log('Touch', value, rootValue);
    };
    return (React.createElement(Wishlist.Pressable, { onPress: handler },
        React.createElement(View, { style: styles.reactionItem },
            React.createElement(Wishlist.Text, { style: styles.reactionText }, emoji),
            React.createElement(Wishlist.IF, { condition: showCounter },
                React.createElement(Wishlist.Text, { style: styles.reactionCount }, count)))));
};
export const AddReaction = ({ onAddReaction, }) => {
    return (React.createElement(Wishlist.Pressable, { onPress: onAddReaction },
        React.createElement(View, { style: styles.reactionItem },
            React.createElement(Image, { style: styles.addReactionImage, source: addReaction }))));
};
export const ChatItemView = ({ type, onAddReaction }) => {
    const author = useTemplateValue((item) => item.author);
    const avatarUrl = useTemplateValue((item) => {
        return item.avatarUrl;
    });
    const message = useTemplateValue((item) => `${item.key}: ${item.message}`);
    const likeText = useTemplateValue((item) => {
        if (item.liked) {
            return '♥️';
        }
        else {
            return '🖤';
        }
    });
    const likeOpacity = useTemplateValue((item) => {
        if (item.liked) {
            return 1;
        }
        else {
            return 0.4;
        }
    });
    const reactions = useTemplateValue((item) => {
        const obj = item.reactions.reduce((acc, i) => {
            if (acc[i.emoji]) {
                acc[i.emoji].ids.push(i.key);
            }
            else {
                acc[i.emoji] = { ...i, ids: [i.key] };
            }
            return acc;
        }, {});
        return Object.values(obj);
    });
    const data = useWishlistContextData();
    const likeItemListener = (value) => {
        'worklet';
        data.update((dataCopy) => {
            const oldValue = dataCopy.getItem(value.key);
            if (oldValue) {
                oldValue.liked = !oldValue.liked;
                dataCopy.setItem(value.key, oldValue);
            }
        });
    };
    const toggleImage = (value) => {
        'worklet';
        data.update((dataCopy) => {
            const oldValue = dataCopy.getItem(value.key);
            if (oldValue) {
                oldValue.showBiggerAvatar = !oldValue.showBiggerAvatar;
                dataCopy.setItem(value.key, oldValue);
            }
        });
    };
    const avatarSize = useTemplateValue((item) => {
        return item.showBiggerAvatar ? 60 : 30;
    });
    return (React.createElement(View, { style: [styles.container, type === 'me' ? styles.me : styles.other] },
        React.createElement(View, { style: styles.imageAndAuthor },
            React.createElement(Wishlist.Pressable, { onPress: toggleImage },
                React.createElement(Wishlist.Image, { style: [
                        styles.avatarImage,
                        { width: avatarSize, height: avatarSize },
                    ], source: { uri: avatarUrl } })),
            React.createElement(View, { style: styles.authorContainer },
                React.createElement(Wishlist.Text, { style: styles.authorText }, author),
                type === 'other' ? (React.createElement(Wishlist.Pressable, { onPress: likeItemListener },
                    React.createElement(Wishlist.Text, { style: { opacity: likeOpacity } }, likeText))) : null)),
        React.createElement(View, { style: styles.messageContainer },
            React.createElement(Wishlist.Text, { style: styles.messageText }, message)),
        React.createElement(Wishlist.Template, { type: "reaction" },
            React.createElement(Reaction, null)),
        React.createElement(View, { style: styles.reactionsContainer },
            React.createElement(Wishlist.ForEach, { style: styles.row, items: reactions, template: "reaction" }),
            type === 'other' ? (React.createElement(AddReaction, { onAddReaction: onAddReaction })) : null)));
};
const styles = StyleSheet.create({
    container: {
        margin: 10,
        padding: 10,
        width: '70%',
        borderRadius: 10,
    },
    me: {
        alignSelf: 'flex-end',
        backgroundColor: '#A4A5EF',
    },
    other: {
        backgroundColor: '#EFEFEF',
    },
    imageAndAuthor: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarImage: {
        borderRadius: 15,
    },
    authorContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginHorizontal: 6,
        flex: 1,
    },
    authorText: {
        fontWeight: 'bold',
    },
    messageContainer: {
        marginTop: 6,
    },
    messageText: {},
    reactionsContainer: {
        paddingTop: 12,
        paddingBottom: 4,
        flexDirection: 'row',
    },
    row: {
        flexDirection: 'row',
    },
    reactionItem: {
        marginRight: 6,
        flexDirection: 'row',
        alignItems: 'center',
        textAlignVertical: 'center',
        backgroundColor: '#d6d6d6',
        borderRadius: 8,
        padding: 2,
    },
    reactionText: {
        fontSize: 18,
    },
    reactionCount: {
        fontSize: 13,
        paddingLeft: 2,
        paddingRight: 6,
    },
    reactionRoot: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    addReactionImage: {
        width: 22,
        height: 22,
        tintColor: 'gray',
    },
});
