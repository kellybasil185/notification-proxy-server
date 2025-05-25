import logging
import os
import asyncio
import aiohttp # For asynchronous HTTP requests
from telethon import TelegramClient, events

# --- Configuration ---
API_ID = 28936470  
API_HASH = '9546c38dced087fe14047f143eabd88f'
DATA_DIR = os.environ.get('DATA_DIR', '.') # On Render, DATA_DIR could be /data
SESSION_NAME = os.path.join(DATA_DIR, 'my_dashboard_notifier_session') # Session file in data directory
PROXY_SERVER_WEBHOOK_URL = "http://localhost:3001/webhook/telegram" # Your Node.js proxy
client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
TARGET_CHAT_IDS = [
    6840163636,      # Example: Raph (DM with this user)
    -1001452351575,  # Example: SwingTradingLab (Group/Channel)
    770150645,       # Example: Phillipe Lopez (DM with this user)
    7581379598,      # Example: Bro Arizona (DM with this user)
    6518878082,      # Example: Self (Your own ID, messages you save to "Saved Messages" or DMs with yourself)
]


# --- Logging Setup ---
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger(__name__)


async def forward_to_proxy(payload):
    """Sends the payload to your proxy server."""
    async with aiohttp.ClientSession() as http_session:
        try:
            logger.info(f"Forwarding to proxy: {payload}")
            async with http_session.post(PROXY_SERVER_WEBHOOK_URL, json=payload, timeout=10) as response:
                response_text = await response.text()
                if response.status >= 200 and response.status < 300:
                    logger.info(f"Successfully forwarded message. Proxy responded with: {response.status} - {response_text}")
                else:
                    logger.error(f"Error forwarding message. Proxy responded with: {response.status} - {response_text}")
        except aiohttp.ClientError as e:
            logger.error(f"AIOHTTP ClientError forwarding message to proxy: {e}")
        except Exception as e:
            logger.error(f"An unexpected error occurred during forwarding: {e}")

@client.on(events.NewMessage(chats=TARGET_CHAT_IDS))
async def new_message_handler(event: events.NewMessage.Event):
    """Handles new messages from the specified chats, ignoring outgoing messages."""
    message = event.message
    
    # --- ADD THIS CHECK TO IGNORE YOUR OWN OUTGOING MESSAGES ---
    if message.out:
        logger.info(f"Ignoring outgoing message in chat ID: {event.chat_id}. Text: '{message.text}'")
        return
    # --- END OF CHECK ---

    chat = await event.get_chat() 
    sender = await event.get_sender()

    chat_id_from_event = event.chat_id
    
    logger.info(f"Received INCOMING message in chat ID: {chat_id_from_event} (Type: {type(chat).__name__})")
    logger.info(f"Message text: '{message.text}'")

    if not message.text:
        logger.info("Incoming message has no text, not forwarding.")
        return

    payload = {
        "text": message.text,
        "chat_id": chat_id_from_event,
        "message_id": message.id,
        "from_user_id": sender.id if sender else None,
        "from_user_username": sender.username if sender and sender.username else (sender.first_name if sender else "UnknownUser"),
        "chat_title": getattr(chat, 'title', None) or type(chat).__name__,
        "timestamp": message.date.timestamp()
    }
    
    await forward_to_proxy(payload)

async def main():
    """Main function to connect and run the client."""
    try:
        logger.info("Connecting to Telegram as a user...")
        await client.connect()
        if not await client.is_user_authorized():
            logger.info("First time login or session expired. Please follow CLI prompts to enter phone and code.")
            await client.start() # Handles phone and code input if needed

        logger.info("Client started successfully. Listening for new messages in target chats...")
        await client.run_until_disconnected()
    except Exception as e:
        logger.error(f"Error in main function: {e}")
    finally:
        if client.is_connected():
            logger.info("Disconnecting client...")
            await client.disconnect()
        logger.info("Client stopped.")

if __name__ == '__main__':
    asyncio.run(main())
