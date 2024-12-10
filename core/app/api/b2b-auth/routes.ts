import { NextRequest } from 'next/server';
import axios from 'axios'
import { getSessionCustomerId } from '~/auth';
import { getToken } from 'next-auth/jwt';

export const POST = async (request: NextRequest) => {
    const customerId = await getSessionCustomerId()
    const customerAccessToken = await getToken({ req: request, secret: process.env.AUTH_SECRET });
    const response = await axios.post("https://b2b-tunnel.bundleb2b.net:9005/api/io/auth/customers/storefront", {
        channelId: process.env.BIGCOMMERCE_CHANNEL_ID, customerId, customerAccessToken
    })
    console.log('response', response.data)
    return response.data;
};

export const runtime = 'edge';
